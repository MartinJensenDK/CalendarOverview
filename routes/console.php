<?php

use Illuminate\Support\Facades\Schedule;

// Optional background sync. Add to cron: * * * * * php /path/to/artisan schedule:run
Schedule::command('calendar:sync --directory --photos --prune')->dailyAt('03:00')->withoutOverlapping();
Schedule::command('calendar:sync --schedule')->everyFifteenMinutes()->withoutOverlapping();
