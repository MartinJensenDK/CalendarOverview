<?php

namespace App\Services;

use App\Models\DirectoryUser;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * 150 fictional users with deterministic, generated calendars. Nothing is fetched from Graph.
 */
class DemoDataService
{
    public const PREFIX = 'demo-';

    private const FIRST = ['Anna', 'Mads', 'Sofie', 'Emil', 'Freja', 'Lucas', 'Ida', 'Oscar', 'Clara', 'Noah', 'Laura', 'William', 'Ella', 'Oliver', 'Alma', 'Victor', 'Maja', 'Magnus', 'Emma', 'Frederik', 'Josefine', 'Malthe', 'Karla', 'Alexander', 'Olivia', 'Elias', 'Agnes', 'Aksel', 'Liv', 'Anton', 'Nora', 'Villads', 'Astrid', 'Carl', 'Mathilde', 'Sebastian', 'Isabella', 'Felix', 'Marie', 'Jonas', 'Sara', 'Christian', 'Line', 'Peter', 'Mette', 'Lars', 'Camilla', 'Thomas', 'Louise', 'Henrik'];

    private const LAST = ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen', 'Knudsen', 'Jakobsen', 'Frandsen', 'Schmidt', 'Lund', 'Holm', 'Berg', 'Dahl', 'Winther', 'Bach'];

    private const DEPARTMENTS = ['Sales', 'Marketing', 'Engineering', 'Product', 'Finance', 'People & Culture', 'Customer Success', 'Operations', 'Legal', 'IT', 'Design'];

    private const TITLES = ['Account Manager', 'Software Engineer', 'Product Designer', 'Project Manager', 'Controller', 'HR Partner', 'Support Specialist', 'Data Analyst', 'QA Engineer', 'Consultant', 'Marketing Specialist', 'Solutions Architect', 'Office Coordinator', 'Recruiter', 'DevOps Engineer'];

    private const MEETINGS = ['Team sync', '1:1', 'Customer call', 'Sprint planning', 'Design review', 'Weekly status', 'Interview', 'Budget review', 'Workshop', 'Retrospective', 'Demo', 'Planning', 'Kickoff', 'Steering committee', 'Roadmap review', 'Onboarding'];

    private const LOCATIONS = ['Teams', 'Room 1.02', 'Room 2.14', 'The Lounge', 'Client site', 'Teams', 'Boardroom', ''];

    public function count(): int
    {
        return (int) config('calendar.demo_user_count', 150);
    }

    public function isSeeded(): bool
    {
        return DirectoryUser::where('is_demo', true)->count() >= $this->count();
    }

    /** Creates (or refreshes) the demo users. */
    public function seed(): int
    {
        $now = Carbon::now();
        $rows = [];
        $n = $this->count();
        $managerCount = min(11, max(1, intdiv($n, 12)));
        for ($i = 0; $i < $n; $i++) {
            $first = self::FIRST[$i % count(self::FIRST)];
            $last = self::LAST[($i * 7 + intdiv($i, 3)) % count(self::LAST)];
            $isCeo = $i === 0;
            $isManager = $i > 0 && $i <= $managerCount;
            $department = $isCeo ? 'Management' : self::DEPARTMENTS[($isManager ? $i - 1 : ($i - $managerCount - 1)) % count(self::DEPARTMENTS)];
            $managerIndex = $isCeo ? null : ($isManager ? 0 : 1 + (($i - $managerCount - 1) % $managerCount));
            $rows[] = [
                'id' => self::id($i),
                'display_name' => $first.' '.$last,
                'given_name' => $first,
                'surname' => $last,
                'mail' => strtolower(self::ascii($first).'.'.self::ascii($last).($i + 1).'@demo.example'),
                'upn' => strtolower(self::ascii($first).'.'.self::ascii($last).($i + 1).'@demo.example'),
                'job_title' => $isCeo ? 'CEO' : ($isManager ? 'Head of '.$department : self::TITLES[($i * 5) % count(self::TITLES)]),
                'department' => $department,
                'office_location' => ['Copenhagen', 'Aarhus', 'Odense', 'Remote'][$i % 4],
                'manager_id' => $managerIndex === null ? null : self::id($managerIndex),
                'account_enabled' => true,
                'has_photo' => false,
                'is_demo' => true,
                'synced_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        DirectoryUser::upsert($rows, ['id'], ['display_name', 'given_name', 'surname', 'mail', 'upn', 'job_title', 'department', 'office_location', 'manager_id', 'account_enabled', 'is_demo', 'updated_at']);

        return $n;
    }

    public function remove(): int
    {
        $ids = DirectoryUser::where('is_demo', true)->pluck('id')->all();
        if ($ids === []) {
            return 0;
        }
        DB::table('group_members')->whereIn('directory_user_id', $ids)->delete();
        DB::table('group_managers')->whereIn('manager_directory_user_id', $ids)->delete();

        return DirectoryUser::whereIn('id', $ids)->delete();
    }

    public static function id(int $index): string
    {
        return self::PREFIX.str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT);
    }

    public static function isDemoId(string $id): bool
    {
        return str_starts_with($id, self::PREFIX);
    }

    /** Deterministic schedule items for one demo user (UTC ISO strings, API format). */
    public function items(DirectoryUser $user, CarbonImmutable $from, CarbonImmutable $to, string $tz): array
    {
        $index = (int) substr($user->id, strlen(self::PREFIX)) - 1;
        $items = [];
        $cursor = $from->setTimezone($tz)->startOfDay();
        $end = $to->setTimezone($tz);
        $vacationStart = null;

        while ($cursor->lt($end)) {
            $rand = $this->rng($user->id.$cursor->toDateString());
            $weekend = $cursor->isWeekend();

            // A vacation week roughly every ninth week, staggered per user.
            if (($cursor->weekOfYear + $index) % 9 === 0 && $cursor->isMonday()) {
                $vacationStart = $cursor;
            }
            $onVacation = $vacationStart && $cursor->lt($vacationStart->addDays(7)) && $cursor->gte($vacationStart);

            if ($onVacation) {
                if (! $weekend) {
                    $items[] = $this->item($cursor, $cursor->addDay(), 'oof', $index % 3 === 0 ? 'Ferie' : 'Vacation', null, true);
                }
                $cursor = $cursor->addDay();

                continue;
            }
            if ($weekend) {
                if ($rand() < 0.06) {
                    $items[] = $this->item($cursor->setTime(10, 0), $cursor->setTime(12, 0), 'busy', 'Football', 'Sports hall', false, true);
                }
                $cursor = $cursor->addDay();

                continue;
            }

            $r = $rand();
            if ($r < 0.08) {
                $items[] = $this->item($cursor, $cursor->addDay(), 'workingElsewhere', 'Working from home', null, true);
            } elseif ($r < 0.11) {
                $items[] = $this->item($cursor, $cursor->addDay(), 'oof', 'Out of office', null, true);
                $cursor = $cursor->addDay();

                continue;
            } elseif ($r < 0.14) {
                $items[] = $this->item($cursor->setTime(8, 0), $cursor->setTime(12, 0), 'oof', 'Sick leave', null, false);
            }

            $meetings = (int) floor($rand() * 4) + ($index % 4 === 0 ? 1 : 0);
            $used = [];
            for ($m = 0; $m < $meetings; $m++) {
                $slot = 16 + (int) floor($rand() * 18); // 8:00 .. 16:30 in half-hour slots
                if (in_array($slot, $used, true)) {
                    continue;
                }
                $length = [1, 2, 2, 3, 4][(int) floor($rand() * 5)];
                for ($k = 0; $k < $length; $k++) {
                    $used[] = $slot + $k;
                }
                $status = $rand() < 0.15 ? 'tentative' : 'busy';
                $subject = self::MEETINGS[(int) floor($rand() * count(self::MEETINGS))];
                $private = $rand() < 0.05;
                $start = $cursor->setTime(intdiv($slot, 2), ($slot % 2) * 30);
                $items[] = $this->item($start, $start->addMinutes($length * 30), $status, $private ? null : $subject, $private ? null : (self::LOCATIONS[(int) floor($rand() * count(self::LOCATIONS))] ?: null), false, $private);
            }
            if ($rand() < 0.5) {
                $items[] = $this->item($cursor->setTime(12, 0), $cursor->setTime(12, 30), 'free', 'Lunch', null, false);
            }

            $cursor = $cursor->addDay();
        }

        usort($items, fn ($a, $b) => strcmp($a['s'], $b['s']));

        return $items;
    }

    /**
     * Demo working hours: a handful of weekly patterns, some with shorter Fridays or a day off,
     * plus an occasional late start, so hours visibly differ per person and per day.
     */
    public function workHours(DirectoryUser $user, CarbonImmutable $from, CarbonImmutable $to, string $tz): array
    {
        $index = (int) substr($user->id, strlen(self::PREFIX)) - 1;
        $patterns = [
            [[8, 0], [16, 0], null],   // 08–16
            [[9, 0], [17, 0], null],   // 09–17
            [[7, 30], [15, 30], null], // 07:30–15:30
            [[8, 0], [16, 0], [[8, 0], [13, 0]]], // short Friday
            [[8, 30], [16, 30], false], // Friday off
        ];
        [$start, $end, $friday] = $patterns[$index % count($patterns)];
        $out = [];
        $cursor = $from->setTimezone($tz)->startOfDay();
        $limit = $to->setTimezone($tz);
        while ($cursor->lt($limit)) {
            if (! $cursor->isWeekend()) {
                $rand = $this->rng('wh'.$user->id.$cursor->toDateString());
                [$s, $e] = [$start, $end];
                $skip = false;
                if ($cursor->isFriday()) {
                    if ($friday === false) {
                        $skip = true;
                    } elseif (is_array($friday)) {
                        [$s, $e] = $friday;
                    }
                }
                if (! $skip && $rand() < 0.12) {
                    $s = [$s[0] + 1, $s[1]]; // a late start now and then
                }
                if (! $skip) {
                    $loc = $rand() < 0.35 ? 'remote' : 'office';
                    $out[] = ScheduleService::formatHours($cursor->setTime($s[0], $s[1])->utc(), $cursor->setTime($e[0], $e[1])->utc(), $loc);
                }
            }
            $cursor = $cursor->addDay();
        }

        return $out;
    }

    private function item(CarbonImmutable $start, CarbonImmutable $end, string $status, ?string $subject, ?string $location, bool $allDay, bool $private = false): array
    {
        return ScheduleService::format($start->utc(), $end->utc(), $status, $subject, $location, $allDay, $private);
    }

    /** Small deterministic PRNG returning floats in [0,1). */
    private function rng(string $seed): \Closure
    {
        $state = crc32($seed) & 0x7FFFFFFF;

        return function () use (&$state): float {
            $state = (int) (($state * 1103515245 + 12345) & 0x7FFFFFFF);

            return $state / 0x7FFFFFFF;
        };
    }

    private static function ascii(string $value): string
    {
        return strtr($value, ['æ' => 'ae', 'ø' => 'o', 'å' => 'a', 'Æ' => 'Ae', 'Ø' => 'O', 'Å' => 'A']);
    }
}
