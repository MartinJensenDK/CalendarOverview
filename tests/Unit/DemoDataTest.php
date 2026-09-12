<?php

namespace Tests\Unit;

use App\Models\DirectoryUser;
use App\Services\DemoDataService;
use Carbon\CarbonImmutable;
use Tests\TestCase;

class DemoDataTest extends TestCase
{
    public function test_items_are_deterministic_and_within_range(): void
    {
        $service = new DemoDataService;
        $user = new DirectoryUser(['id' => 'demo-007', 'display_name' => 'Demo Person', 'is_demo' => true]);
        $from = CarbonImmutable::parse('2026-09-14', 'Europe/Copenhagen');
        $to = $from->addDays(14);

        $a = $service->items($user, $from, $to, 'Europe/Copenhagen');
        $b = $service->items($user, $from, $to, 'Europe/Copenhagen');
        $this->assertSame($a, $b);
        $this->assertNotEmpty($a);
        foreach ($a as $item) {
            $this->assertGreaterThanOrEqual($from->utc()->toIso8601ZuluString(), $item['s']);
            $this->assertLessThanOrEqual($to->addDay()->utc()->toIso8601ZuluString(), $item['e']);
            $this->assertContains($item['st'], ['free', 'tentative', 'busy', 'oof', 'workingElsewhere']);
        }
    }
}
