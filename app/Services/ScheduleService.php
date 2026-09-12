<?php

namespace App\Services;

use App\Graph\GraphTokenProvider;
use App\Graph\ReauthRequiredException;
use App\Models\DirectoryUser;
use App\Models\ScheduleItem;
use App\Models\User;
use App\Models\WorkHour;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Free/busy information and working hours for many users, cached in schedule_items /
 * work_hours and refreshed through POST /me/calendar/getSchedule (delegated Calendars.Read).
 * Working hours come from Graph, never from app settings: colleagues' from the getSchedule
 * response, your own per-day plan from /me/settings/workHoursAndLocations.
 */
class ScheduleService
{
    public const SCHEDULES_PER_CALL = 20;

    public const WINDOW_DAYS = 62;

    public const STATUSES = ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'];

    public function __construct(
        private readonly GraphTokenProvider $tokens,
        private readonly DemoDataService $demo,
    ) {}

    /**
     * @param  Collection<int, DirectoryUser>  $users
     * @return array{items: array<string, list<array>>, work: array<string, list<array>>, errors: array<string, string>, fetched_at: string}
     */
    public function itemsFor(User $actor, Collection $users, CarbonImmutable $from, CarbonImmutable $to, string $tz, bool $force = false): array
    {
        $items = [];
        $work = [];
        $errors = [];

        [$demoUsers, $realUsers] = $users->partition(fn (DirectoryUser $u) => $u->is_demo);
        foreach ($demoUsers as $u) {
            $items[$u->id] = $this->demo->items($u, $from, $to, $tz);
            $work[$u->id] = $this->demo->workHours($u, $from, $to, $tz);
        }

        if ($realUsers->isNotEmpty()) {
            $stale = $force ? $realUsers : $this->staleUsers($realUsers, $from, $to, $tz);
            if ($stale->isNotEmpty()) {
                try {
                    $errors = $this->refresh($actor, $stale, $from, $to, $tz);
                } catch (\Throwable $e) {
                    if ($e instanceof ReauthRequiredException) {
                        throw $e;
                    }
                    Log::warning('Schedule refresh failed', ['message' => $e->getMessage()]);
                    foreach ($stale as $u) {
                        $errors[$u->id] = 'refresh_failed';
                    }
                }
            }
            foreach ($this->cached($realUsers->pluck('id')->all(), $from, $to) as $id => $list) {
                $items[$id] = $list;
            }
            foreach ($this->cachedWorkHours($realUsers->pluck('id')->all(), $from, $to) as $id => $list) {
                $work[$id] = $list;
            }
        }

        foreach ($users as $u) {
            $items[$u->id] ??= [];
            $work[$u->id] ??= [];
        }

        return ['items' => $items, 'work' => $work, 'errors' => $errors, 'fetched_at' => Carbon::now()->toIso8601String()];
    }

    /** Users whose cache does not cover every day of the range within the TTL. */
    private function staleUsers(Collection $users, CarbonImmutable $from, CarbonImmutable $to, string $tz): Collection
    {
        $days = $this->days($from, $to, $tz);
        $ttl = Carbon::now()->subMinutes(config('calendar.schedule_ttl_minutes'));

        $fresh = DB::table('schedule_freshness')
            ->whereIn('directory_user_id', $users->pluck('id')->all())
            ->whereBetween('day', [$days[0], end($days)])
            ->where('fetched_at', '>=', $ttl)
            ->get()
            ->groupBy('directory_user_id')
            ->map(fn ($rows) => $rows->pluck('day')->map(fn ($d) => substr((string) $d, 0, 10))->all());

        return $users->filter(function (DirectoryUser $u) use ($fresh, $days) {
            $have = $fresh[$u->id] ?? [];

            return count(array_diff($days, $have)) > 0;
        })->values();
    }

    /** @return list<string> Y-m-d for each local day in the range */
    public function days(CarbonImmutable $from, CarbonImmutable $to, string $tz): array
    {
        $days = [];
        $cursor = $from->setTimezone($tz)->startOfDay();
        $end = $to->setTimezone($tz);
        while ($cursor->lt($end)) {
            $days[] = $cursor->toDateString();
            $cursor = $cursor->addDay();
        }

        return $days ?: [$from->setTimezone($tz)->toDateString()];
    }

    /** Fetch from Graph and replace the cache. Returns per-user errors. */
    public function refresh(User $actor, Collection $users, CarbonImmutable $from, CarbonImmutable $to, string $tz): array
    {
        $graph = $this->tokens->client($actor);
        $errors = [];
        $parsed = [];
        $hours = []; // per user: list of [start_utc, end_utc, location]
        $ownPlan = null; // own per-day plan from workHoursAndLocations, when the tenant has it

        $byMail = $users->filter(fn (DirectoryUser $u) => filled($u->mail))->keyBy(fn (DirectoryUser $u) => strtolower($u->mail));
        foreach ($users->filter(fn (DirectoryUser $u) => blank($u->mail)) as $u) {
            $errors[$u->id] = 'no_mailbox';
        }

        $calls = [];
        // getSchedule accepts at most 62 days per call: split long ranges into windows.
        foreach ($this->windows($from, $to) as $w => [$wFrom, $wTo]) {
            $startLocal = $wFrom->setTimezone($tz)->format('Y-m-d\TH:i:s');
            $endLocal = $wTo->setTimezone($tz)->format('Y-m-d\TH:i:s');
            foreach (array_chunk($byMail->keys()->all(), self::SCHEDULES_PER_CALL) as $i => $mails) {
                $calls['s'.$w.'_'.$i] = fn (PendingRequest $req) => $req
                    ->withHeaders(['Prefer' => 'outlook.timezone="'.$tz.'"'])
                    ->post($graph->url('/me/calendar/getSchedule'), [
                        'schedules' => $mails,
                        'startTime' => ['dateTime' => $startLocal, 'timeZone' => $tz],
                        'endTime' => ['dateTime' => $endLocal, 'timeZone' => $tz],
                        'availabilityViewInterval' => 30,
                    ]);
            }
        }

        $me = $users->first(fn (DirectoryUser $u) => $u->id === $actor->entra_id);
        if ($me) {
            // Your own working hours can differ per day ("Work hours and location" in Outlook).
            foreach ($this->windows($from, $to) as $w => [$wFrom, $wTo]) {
                $calls['plan'.$w] = fn (PendingRequest $req) => $req->get($graph->url(sprintf(
                    "/me/settings/workHoursAndLocations/occurrencesView(startDateTime='%s',endDateTime='%s')",
                    $wFrom->utc()->format('Y-m-d\TH:i:s\Z'),
                    $wTo->utc()->format('Y-m-d\TH:i:s\Z')
                )));
            }
            $calls['me'] = fn (PendingRequest $req) => $req
                ->withHeaders(['Prefer' => 'outlook.timezone="'.$tz.'"'])
                ->get($graph->url('/me/calendarView'), [
                    'startDateTime' => $from->toIso8601String(),
                    'endDateTime' => $to->toIso8601String(),
                    '$select' => 'subject,start,end,showAs,isAllDay,location,sensitivity,isCancelled',
                    '$orderby' => 'start/dateTime',
                    '$top' => 500,
                ]);
        }

        $responses = $graph->pool($calls);

        foreach ($responses as $key => $response) {
            if (! $response instanceof Response) {
                Log::warning('getSchedule transport error', ['key' => $key, 'error' => (string) $response]);

                continue;
            }
            if (str_starts_with($key, 'plan')) {
                if ($response->successful()) {
                    $ownPlan = array_merge($ownPlan ?? [], $this->parseWorkPlan($response->json('value') ?? []));
                } else {
                    Log::info('workHoursAndLocations unavailable, using mailbox working hours', ['status' => $response->status()]);
                }

                continue;
            }
            if ($key === 'me') {
                if ($response->successful()) {
                    $events = $response->json('value') ?? [];
                    $next = $response->json('@odata.nextLink');
                    $pages = 0;
                    while ($next && $pages++ < 20) {
                        $page = $graph->get($next, [], ['Prefer' => 'outlook.timezone="'.$tz.'"']);
                        $events = array_merge($events, $page['value'] ?? []);
                        $next = $page['@odata.nextLink'] ?? null;
                    }
                    $parsed[$me->id] = $this->parseCalendarView($events, $tz);
                } else {
                    Log::info('calendarView failed', ['status' => $response->status()]);
                }

                continue;
            }
            if (! $response->successful()) {
                $code = $response->json('error.code') ?? 'http_'.$response->status();
                Log::info('getSchedule failed', ['status' => $response->status(), 'code' => $code]);
                foreach ($byMail as $mail => $u) {
                    $errors[$u->id] ??= $response->status() === 403 ? 'consent_required' : (string) $code;
                }

                continue;
            }
            foreach ($response->json('value') ?? [] as $schedule) {
                $mail = strtolower($schedule['scheduleId'] ?? '');
                $user = $byMail[$mail] ?? null;
                if (! $user) {
                    continue;
                }
                if (isset($schedule['error'])) {
                    $errors[$user->id] = $schedule['error']['responseCode'] ?? 'error';

                    continue;
                }
                if (! empty($schedule['workingHours'])) {
                    $hours[$user->id] = array_merge($hours[$user->id] ?? [], $this->expandWorkingHours($schedule['workingHours'], $from, $to));
                }
                // The signed-in user's own calendar comes from calendarView when available.
                if ($me && $user->id === $me->id && isset($parsed[$me->id])) {
                    continue;
                }
                $parsed[$user->id] = array_merge($parsed[$user->id] ?? [], $this->parseScheduleItems($schedule['scheduleItems'] ?? [], $tz));
            }
        }

        if ($me && $ownPlan !== null && $ownPlan !== []) {
            $hours[$me->id] = $ownPlan;
        }

        $this->store($parsed, $hours, $from, $to, $tz);

        return $errors;
    }

    /**
     * getSchedule reports one weekly pattern per mailbox (days of week, start, end, time zone);
     * expand it to concrete intervals for every day of the range so it can vary per day later.
     *
     * @return list<array{0: CarbonImmutable, 1: CarbonImmutable, 2: ?string}>
     */
    private function expandWorkingHours(array $wh, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $days = array_map('strtolower', $wh['daysOfWeek'] ?? []);
        $start = substr((string) ($wh['startTime'] ?? ''), 0, 8);
        $end = substr((string) ($wh['endTime'] ?? ''), 0, 8);
        if ($days === [] || ! preg_match('/^\d\d:\d\d:\d\d$/', $start) || ! preg_match('/^\d\d:\d\d:\d\d$/', $end)) {
            return [];
        }
        $tz = $this->normalizeTz((string) ($wh['timeZone']['name'] ?? 'UTC'));
        $out = [];
        $cursor = $from->setTimezone($tz)->startOfDay();
        $limit = $to->setTimezone($tz);
        while ($cursor->lt($limit)) {
            if (in_array(strtolower($cursor->format('l')), $days, true)) {
                $s = $this->toUtc($cursor->toDateString().'T'.$start, $tz);
                $e = $this->toUtc($cursor->toDateString().'T'.$end, $tz);
                if ($s && $e && $e->lte($s)) {
                    $e = $e->addDay(); // night shift crossing midnight
                }
                if ($s && $e) {
                    $out[] = [$s, $e, null];
                }
            }
            $cursor = $cursor->addDay();
        }

        return $out;
    }

    /** @return list<array{0: CarbonImmutable, 1: CarbonImmutable, 2: ?string}> */
    private function parseWorkPlan(array $occurrences): array
    {
        $out = [];
        foreach ($occurrences as $o) {
            $s = $this->toUtc($o['start']['dateTime'] ?? null, $o['start']['timeZone'] ?? 'UTC');
            $e = $this->toUtc($o['end']['dateTime'] ?? null, $o['end']['timeZone'] ?? 'UTC');
            if (! $s || ! $e || $e->lte($s)) {
                continue;
            }
            $loc = isset($o['workLocationType']) ? mb_substr((string) $o['workLocationType'], 0, 32) : null;
            $out[] = [$s, $e, $loc];
        }

        return $out;
    }

    /** @return list<array{0: CarbonImmutable, 1: CarbonImmutable}> consecutive windows of at most WINDOW_DAYS */
    public function windows(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $out = [];
        $cursor = $from;
        while ($cursor->lt($to)) {
            $next = $cursor->addDays(self::WINDOW_DAYS);
            if ($next->gt($to)) {
                $next = $to;
            }
            $out[] = [$cursor, $next];
            $cursor = $next;
        }

        return $out ?: [[$from, $to]];
    }

    private function parseScheduleItems(array $scheduleItems, string $tz): array
    {
        $out = [];
        foreach ($scheduleItems as $item) {
            $start = $this->toUtc($item['start']['dateTime'] ?? null, $item['start']['timeZone'] ?? $tz);
            $end = $this->toUtc($item['end']['dateTime'] ?? null, $item['end']['timeZone'] ?? $tz);
            if (! $start || ! $end || $end->lte($start)) {
                continue;
            }
            $out[] = [
                'start_utc' => $start,
                'end_utc' => $end,
                'status' => $this->status($item['status'] ?? 'busy'),
                'subject' => isset($item['subject']) ? mb_substr($item['subject'], 0, 255) : null,
                'location' => isset($item['location']) ? mb_substr($item['location'], 0, 255) : null,
                'is_private' => (bool) ($item['isPrivate'] ?? false),
                'is_all_day' => $this->looksAllDay($item['start']['dateTime'] ?? '', $start, $end),
            ];
        }

        return $out;
    }

    private function parseCalendarView(array $events, string $tz): array
    {
        $out = [];
        foreach ($events as $event) {
            if (! empty($event['isCancelled'])) {
                continue;
            }
            $start = $this->toUtc($event['start']['dateTime'] ?? null, $event['start']['timeZone'] ?? $tz);
            $end = $this->toUtc($event['end']['dateTime'] ?? null, $event['end']['timeZone'] ?? $tz);
            if (! $start || ! $end || $end->lte($start)) {
                continue;
            }
            $private = in_array($event['sensitivity'] ?? 'normal', ['private', 'confidential'], true);
            $out[] = [
                'start_utc' => $start,
                'end_utc' => $end,
                'status' => $this->status($event['showAs'] ?? 'busy'),
                'subject' => $private ? null : mb_substr($event['subject'] ?? '', 0, 255),
                'location' => $private ? null : (mb_substr($event['location']['displayName'] ?? '', 0, 255) ?: null),
                'is_private' => $private,
                'is_all_day' => (bool) ($event['isAllDay'] ?? false),
            ];
        }

        return $out;
    }

    private function toUtc(?string $dateTime, string $tz): ?CarbonImmutable
    {
        if (! $dateTime) {
            return null;
        }
        try {
            return CarbonImmutable::parse(substr($dateTime, 0, 19), $this->normalizeTz($tz))->utc();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Graph echoes Windows time zone names; map the ones we cannot parse to UTC offsets via PHP. */
    private function normalizeTz(string $tz): string
    {
        if ($tz === 'tzone://Microsoft/Utc' || $tz === 'UTC' || $tz === '') {
            return 'UTC';
        }
        if (in_array($tz, timezone_identifiers_list(), true)) {
            return $tz;
        }
        $map = self::windowsToIana();

        return $map[$tz] ?? 'UTC';
    }

    private function looksAllDay(string $localStart, CarbonImmutable $start, CarbonImmutable $end): bool
    {
        $minutes = $start->diffInMinutes($end);

        return str_ends_with($localStart, 'T00:00:00.0000000') && $minutes >= 1440 && $minutes % 1440 === 0;
    }

    private function status(string $status): string
    {
        return in_array($status, self::STATUSES, true) ? $status : 'busy';
    }

    private function store(array $parsed, array $hours, CarbonImmutable $from, CarbonImmutable $to, string $tz): void
    {
        if ($parsed === [] && $hours === []) {
            return;
        }
        $now = Carbon::now();
        $days = $this->days($from, $to, $tz);

        DB::transaction(function () use ($parsed, $hours, $from, $to, $now, $days) {
            $ids = array_values(array_unique(array_merge(array_keys($parsed), array_keys($hours))));
            ScheduleItem::whereIn('directory_user_id', $ids)
                ->where('end_utc', '>', $from->utc()->toDateTimeString())
                ->where('start_utc', '<', $to->utc()->toDateTimeString())
                ->delete();
            WorkHour::whereIn('directory_user_id', $ids)
                ->where('end_utc', '>', $from->utc()->toDateTimeString())
                ->where('start_utc', '<', $to->utc()->toDateTimeString())
                ->delete();

            $whRows = [];
            foreach ($hours as $id => $list) {
                foreach ($list as [$s, $e, $loc]) {
                    $whRows[] = ['directory_user_id' => $id, 'start_utc' => $s->toDateTimeString(), 'end_utc' => $e->toDateTimeString(), 'location' => $loc];
                }
            }
            foreach (array_chunk($whRows, 500) as $chunk) {
                WorkHour::insert($chunk);
            }

            $rows = [];
            foreach ($parsed as $id => $items) {
                foreach ($items as $item) {
                    $rows[] = [
                        'directory_user_id' => $id,
                        'start_utc' => $item['start_utc']->toDateTimeString(),
                        'end_utc' => $item['end_utc']->toDateTimeString(),
                        'status' => $item['status'],
                        'subject' => $item['subject'],
                        'location' => $item['location'],
                        'is_private' => $item['is_private'],
                        'is_all_day' => $item['is_all_day'],
                    ];
                }
            }
            foreach (array_chunk($rows, 500) as $chunk) {
                ScheduleItem::insert($chunk);
            }

            $fresh = [];
            foreach ($ids as $id) {
                foreach ($days as $day) {
                    $fresh[] = ['directory_user_id' => $id, 'day' => $day, 'fetched_at' => $now];
                }
            }
            foreach (array_chunk($fresh, 500) as $chunk) {
                DB::table('schedule_freshness')->upsert($chunk, ['directory_user_id', 'day'], ['fetched_at']);
            }
        });
    }

    /** @return array<string, list<array>> */
    public function cached(array $ids, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $out = [];
        ScheduleItem::whereIn('directory_user_id', $ids)
            ->where('end_utc', '>', $from->utc()->toDateTimeString())
            ->where('start_utc', '<', $to->utc()->toDateTimeString())
            ->orderBy('start_utc')
            ->get()
            ->each(function (ScheduleItem $item) use (&$out) {
                $out[$item->directory_user_id][] = self::format($item->start_utc, $item->end_utc, $item->status, $item->subject, $item->location, $item->is_all_day, $item->is_private);
            });

        return $out;
    }

    /** @return array<string, list<array{s: string, e: string, loc: ?string}>> */
    public function cachedWorkHours(array $ids, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $out = [];
        WorkHour::whereIn('directory_user_id', $ids)
            ->where('end_utc', '>', $from->utc()->toDateTimeString())
            ->where('start_utc', '<', $to->utc()->toDateTimeString())
            ->orderBy('start_utc')
            ->get()
            ->each(function (WorkHour $h) use (&$out) {
                $out[$h->directory_user_id][] = self::formatHours($h->start_utc, $h->end_utc, $h->location);
            });

        return $out;
    }

    public static function formatHours(Carbon|CarbonImmutable $start, Carbon|CarbonImmutable $end, ?string $location): array
    {
        return ['s' => $start->toIso8601ZuluString(), 'e' => $end->toIso8601ZuluString(), 'loc' => $location];
    }

    public static function format(Carbon|CarbonImmutable $start, Carbon|CarbonImmutable $end, string $status, ?string $subject, ?string $location, bool $allDay, bool $private): array
    {
        return [
            's' => $start->toIso8601ZuluString(),
            'e' => $end->toIso8601ZuluString(),
            'st' => $status,
            'sub' => $subject,
            'loc' => $location,
            'ad' => $allDay,
            'pr' => $private,
        ];
    }

    public function forget(array $ids): void
    {
        ScheduleItem::whereIn('directory_user_id', $ids)->delete();
        WorkHour::whereIn('directory_user_id', $ids)->delete();
        DB::table('schedule_freshness')->whereIn('directory_user_id', $ids)->delete();
    }

    /** Purge cached items older than a month to keep the table small. */
    public function prune(): int
    {
        $cutoff = Carbon::now()->subDays(35)->toDateTimeString();
        DB::table('schedule_freshness')->where('day', '<', Carbon::now()->subDays(35)->toDateString())->delete();
        WorkHour::where('end_utc', '<', $cutoff)->delete();

        return ScheduleItem::where('end_utc', '<', $cutoff)->delete();
    }

    public static function windowsToIana(): array
    {
        return [
            'Romance Standard Time' => 'Europe/Copenhagen',
            'W. Europe Standard Time' => 'Europe/Berlin',
            'Central Europe Standard Time' => 'Europe/Prague',
            'Central European Standard Time' => 'Europe/Warsaw',
            'GMT Standard Time' => 'Europe/London',
            'Greenwich Standard Time' => 'Atlantic/Reykjavik',
            'E. Europe Standard Time' => 'Europe/Chisinau',
            'FLE Standard Time' => 'Europe/Helsinki',
            'GTB Standard Time' => 'Europe/Athens',
            'Russian Standard Time' => 'Europe/Moscow',
            'Turkey Standard Time' => 'Europe/Istanbul',
            'Eastern Standard Time' => 'America/New_York',
            'Central Standard Time' => 'America/Chicago',
            'Mountain Standard Time' => 'America/Denver',
            'Pacific Standard Time' => 'America/Los_Angeles',
            'Alaskan Standard Time' => 'America/Anchorage',
            'Hawaiian Standard Time' => 'Pacific/Honolulu',
            'Atlantic Standard Time' => 'America/Halifax',
            'SA Pacific Standard Time' => 'America/Bogota',
            'E. South America Standard Time' => 'America/Sao_Paulo',
            'Argentina Standard Time' => 'America/Buenos_Aires',
            'India Standard Time' => 'Asia/Kolkata',
            'China Standard Time' => 'Asia/Shanghai',
            'Tokyo Standard Time' => 'Asia/Tokyo',
            'Korea Standard Time' => 'Asia/Seoul',
            'Singapore Standard Time' => 'Asia/Singapore',
            'AUS Eastern Standard Time' => 'Australia/Sydney',
            'New Zealand Standard Time' => 'Pacific/Auckland',
            'South Africa Standard Time' => 'Africa/Johannesburg',
            'Arabian Standard Time' => 'Asia/Dubai',
            'Israel Standard Time' => 'Asia/Jerusalem',
            'UTC' => 'UTC',
        ];
    }
}
