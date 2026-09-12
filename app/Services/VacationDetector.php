<?php

namespace App\Services;

use Carbon\CarbonImmutable;

/**
 * Finds vacation periods in a person's cached calendar items: whole-day items that are
 * out-of-office or whose subject reads like a vacation, merged into continuous periods
 * (a weekend between two vacation days does not split a period).
 */
class VacationDetector
{
    public const SUBJECT_PATTERN = '/\b(vacation|ferie|feriedag|holiday|holidays)\b/iu';

    /**
     * @param  list<array{s: string, e: string, st: string, sub: ?string, ad: bool}>  $items  API-format items (UTC)
     * @return list<array{from: string, to: string, days: int, sub: ?string}>
     */
    public static function periods(array $items, string $tz): array
    {
        $days = [];
        foreach ($items as $it) {
            $start = CarbonImmutable::parse($it['s'])->setTimezone($tz);
            $end = CarbonImmutable::parse($it['e'])->setTimezone($tz);
            $wholeDay = ! empty($it['ad']) || $start->diffInMinutes($end) >= 20 * 60;
            $looksLikeVacation = ($it['st'] ?? '') === 'oof' || (isset($it['sub']) && preg_match(self::SUBJECT_PATTERN, (string) $it['sub']));
            if (! $wholeDay || ! $looksLikeVacation) {
                continue;
            }
            $last = $end->subMinute()->startOfDay(); // end is exclusive
            for ($d = $start->startOfDay(); $d->lte($last); $d = $d->addDay()) {
                $days[$d->toDateString()] ??= $it['sub'] ?? null;
            }
        }
        if ($days === []) {
            return [];
        }
        ksort($days);

        $out = [];
        $cur = null;
        foreach ($days as $day => $subject) {
            $date = CarbonImmutable::parse($day, $tz);
            if ($cur && self::bridges($cur['toDate'], $date)) {
                $cur['toDate'] = $date;
                $cur['sub'] ??= $subject;

                continue;
            }
            if ($cur) {
                $out[] = self::finish($cur);
            }
            $cur = ['fromDate' => $date, 'toDate' => $date, 'sub' => $subject];
        }
        $out[] = self::finish($cur);

        return $out;
    }

    /** Consecutive days, or only weekend days in between. */
    private static function bridges(CarbonImmutable $prev, CarbonImmutable $next): bool
    {
        for ($d = $prev->addDay(); $d->lt($next); $d = $d->addDay()) {
            if (! $d->isWeekend()) {
                return false;
            }
        }

        return true;
    }

    private static function finish(array $cur): array
    {
        return [
            'from' => $cur['fromDate']->toDateString(),
            'to' => $cur['toDate']->toDateString(),
            'days' => (int) $cur['fromDate']->diffInDays($cur['toDate']) + 1,
            'sub' => $cur['sub'] !== null ? mb_substr((string) $cur['sub'], 0, 80) : null,
        ];
    }
}
