<?php

namespace App\Console\Commands;

use App\Services\DemoDataService;
use Illuminate\Console\Command;

class DemoCommand extends Command
{
    protected $signature = 'calendar:demo {state=on : on|off}';

    protected $description = 'Seed or remove the 150 demo users';

    public function handle(DemoDataService $demo): int
    {
        if ($this->argument('state') === 'off') {
            $this->components->info('Removed '.$demo->remove().' demo users.');
        } else {
            $this->components->info('Seeded '.$demo->seed().' demo users. Enable "Demo data" in the profile menu to see them.');
        }

        return self::SUCCESS;
    }
}
