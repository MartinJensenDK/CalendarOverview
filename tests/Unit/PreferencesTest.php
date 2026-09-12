<?php

namespace Tests\Unit;

use App\Support\Preferences;
use PHPUnit\Framework\TestCase;

class PreferencesTest extends TestCase
{
    public function test_merge_ignores_unknown_keys_and_keeps_defaults(): void
    {
        $merged = Preferences::merge(['theme' => 'dark', 'bogus' => 1]);
        $this->assertSame('dark', $merged['theme']);
        $this->assertArrayNotHasKey('bogus', $merged);
        $this->assertSame(50, $merged['page_size']);
        $this->assertSame(7, $merged['days']);
    }
}
