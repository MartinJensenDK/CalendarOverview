<?php

namespace App\Console\Commands;

use App\Graph\ReauthRequiredException;
use App\Models\User;
use App\Services\DirectorySyncService;
use App\Services\GroupResolver;
use App\Services\PhotoSyncService;
use App\Services\ScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Background sync using the stored (delegated) tokens of recently active users.
 */
class SyncCommand extends Command
{
    protected $signature = 'calendar:sync {--directory} {--photos} {--schedule} {--prune} {--days=14}';

    protected $description = 'Refresh the directory, photos and cached availability with the tokens of recently active users';

    public function handle(DirectorySyncService $directory, PhotoSyncService $photos, ScheduleService $schedules, GroupResolver $groups): int
    {
        $all = ! $this->option('directory') && ! $this->option('photos') && ! $this->option('schedule') && ! $this->option('prune');

        $actors = User::whereNotNull('refresh_token')
            ->where('last_seen_at', '>=', Carbon::now()->subDays(14))
            ->orderByDesc('last_seen_at')
            ->get();

        if ($actors->isEmpty()) {
            $this->components->warn('No recently active user with a stored Microsoft session; nothing to do.');

            return self::SUCCESS;
        }

        if ($all || $this->option('directory')) {
            $this->runAs($actors, 'Directory', fn (User $u) => $directory->sync($u).' users');
        }

        if ($all || $this->option('photos')) {
            $this->runAs($actors, 'Photos', function (User $u) use ($groups, $photos) {
                $stored = 0;
                foreach ($groups->visibleUsers($u)->chunk(PhotoSyncService::MAX_PER_REQUEST) as $chunk) {
                    $stored += $photos->ensure($u, $chunk);
                }

                return $stored.' photos';
            });
        }

        if ($all || $this->option('schedule')) {
            $days = (int) $this->option('days');
            foreach ($actors as $actor) {
                try {
                    $users = $groups->visibleUsers($actor)->filter(fn ($u) => ! $u->is_demo);
                    $from = CarbonImmutable::now('UTC')->startOfDay();
                    $result = $schedules->itemsFor($actor, $users, $from, $from->addDays($days), 'UTC');
                    $this->components->twoColumnDetail('Schedule for '.$actor->email, count($result['items']).' users, '.count($result['errors']).' errors');
                } catch (ReauthRequiredException) {
                    $this->components->twoColumnDetail('Schedule for '.$actor->email, 'needs sign-in');
                } catch (\Throwable $e) {
                    $this->components->twoColumnDetail('Schedule for '.$actor->email, 'failed: '.$e->getMessage());
                }
            }
        }

        if ($all || $this->option('prune')) {
            $this->components->twoColumnDetail('Pruned old schedule items', (string) $schedules->prune());
        }

        return self::SUCCESS;
    }

    /** Try each actor until one succeeds (tokens can expire). */
    private function runAs($actors, string $label, callable $fn): void
    {
        foreach ($actors as $actor) {
            try {
                $this->components->twoColumnDetail($label.' (as '.$actor->email.')', (string) $fn($actor));

                return;
            } catch (ReauthRequiredException) {
                continue;
            } catch (\Throwable $e) {
                $this->components->twoColumnDetail($label, 'failed: '.$e->getMessage());

                return;
            }
        }
        $this->components->warn($label.': no usable Microsoft session.');
    }
}
