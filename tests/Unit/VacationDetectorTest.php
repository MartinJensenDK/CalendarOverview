<?php

namespace Tests\Unit;

use App\Services\VacationDetector;
use PHPUnit\Framework\TestCase;

class VacationDetectorTest extends TestCase
{
    private function item(string $s, string $e, string $st = 'oof', ?string $sub = null, bool $ad = true): array
    {
        return ['s' => $s, 'e' => $e, 'st' => $st, 'sub' => $sub, 'ad' => $ad];
    }

    public function test_daily_all_day_oof_items_merge_across_a_weekend(): void
    {
        $items = [];
        foreach (['14', '15', '16', '17', '18', '21', '22'] as $d) { // Mon–Fri, Mon–Tue (CEST midnight = 22:00Z the day before)
            $items[] = $this->item('2026-09-'.($d - 1).'T22:00:00Z', '2026-09-'.$d.'T22:00:00Z', 'oof', 'Ferie');
        }
        $periods = VacationDetector::periods($items, 'Europe/Copenhagen');
        $this->assertSame([['from' => '2026-09-14', 'to' => '2026-09-22', 'days' => 9, 'sub' => 'Ferie']], $periods);
    }

    public function test_only_whole_day_vacation_like_items_count(): void
    {
        $items = [
            $this->item('2026-09-14T07:00:00Z', '2026-09-14T08:00:00Z', 'oof', 'Dentist', false), // one hour: not vacation
            $this->item('2026-09-15T00:00:00Z', '2026-09-16T00:00:00Z', 'busy', 'Team offsite'), // all-day but not vacation-like
            $this->item('2026-09-16T00:00:00Z', '2026-09-18T00:00:00Z', 'busy', 'Summer holiday'), // subject says vacation
            $this->item('2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z', 'oof', null), // out of office, whole day
        ];
        $periods = VacationDetector::periods($items, 'UTC');
        $this->assertSame([
            ['from' => '2026-09-16', 'to' => '2026-09-17', 'days' => 2, 'sub' => 'Summer holiday'],
            ['from' => '2026-09-28', 'to' => '2026-09-28', 'days' => 1, 'sub' => null],
        ], $periods);
        $this->assertSame([], VacationDetector::periods([], 'UTC'));
    }
}
