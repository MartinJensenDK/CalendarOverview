<?php

namespace Tests;

use App\Support\Installer;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Use an isolated storage directory so tests never touch real photos or the install lock.
        $storage = sys_get_temp_dir().'/calendar-tests-'.getmypid();
        @mkdir($storage.'/app', 0777, true);
        @mkdir($storage.'/framework/views', 0777, true);
        @mkdir($storage.'/framework/cache', 0777, true);
        @mkdir($storage.'/framework/sessions', 0777, true);
        @mkdir($storage.'/logs', 0777, true);
        $this->app->useStoragePath($storage);
        config(['view.compiled' => $storage.'/framework/views']);

        if ($this->markInstalled()) {
            Installer::markInstalled();
        }
    }

    protected function markInstalled(): bool
    {
        return true;
    }

    protected function tearDown(): void
    {
        $storage = sys_get_temp_dir().'/calendar-tests-'.getmypid();
        if (is_dir($storage)) {
            exec('rm -rf '.escapeshellarg($storage));
        }
        parent::tearDown();
    }
}
