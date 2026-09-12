<?php

namespace App\Services;

use App\Graph\GraphClient;
use App\Graph\GraphTokenProvider;
use App\Models\DirectoryUser;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Downloads 96x96 profile photos through the JSON batch endpoint and stores them on disk.
 */
class PhotoSyncService
{
    public const MAX_PER_REQUEST = 60;

    public function __construct(private readonly GraphTokenProvider $tokens) {}

    public static function directory(): string
    {
        return storage_path('app/photos');
    }

    public static function pathFor(string $id): string
    {
        return self::directory().'/'.preg_replace('/[^A-Za-z0-9\-_]/', '_', $id).'.jpg';
    }

    /** Photos for the given users when missing or older than the configured age. */
    public function ensure(User $actor, Collection $users, bool $force = false): int
    {
        $limit = Carbon::now()->subDays(config('calendar.photo_sync_days'));
        $due = $users->filter(fn (DirectoryUser $u) => ! $u->is_demo && ($force || ! $u->photo_synced_at || $u->photo_synced_at->lt($limit)))
            ->take(self::MAX_PER_REQUEST)
            ->values();
        if ($due->isEmpty()) {
            return 0;
        }

        try {
            return $this->fetch($this->tokens->client($actor), $due);
        } catch (\Throwable $e) {
            Log::warning('Photo sync failed', ['message' => $e->getMessage()]);

            return 0;
        }
    }

    public function fetch(GraphClient $graph, Collection $users): int
    {
        if (! is_dir(self::directory())) {
            mkdir(self::directory(), 0775, true);
        }

        $requests = $users->map(fn (DirectoryUser $u) => [
            'id' => $u->id,
            'method' => 'GET',
            'url' => '/users/'.rawurlencode($u->id).'/photos/96x96/$value',
        ])->all();

        $responses = $graph->batch($requests);
        $now = Carbon::now();
        $stored = 0;
        foreach ($users as $user) {
            $resp = $responses[$user->id] ?? null;
            $hasPhoto = false;
            if ($resp && $resp['status'] === 200 && is_string($resp['body'])) {
                $binary = base64_decode($resp['body'], true);
                if ($binary !== false && strlen($binary) > 0) {
                    file_put_contents(self::pathFor($user->id), $binary);
                    $hasPhoto = true;
                    $stored++;
                }
            } elseif ($resp && ! in_array($resp['status'], [404, 401, 403], true)) {
                // Transient error: try again next time instead of marking the photo as synced.
                continue;
            }
            if (! $hasPhoto && is_file(self::pathFor($user->id))) {
                @unlink(self::pathFor($user->id));
            }
            $user->forceFill(['has_photo' => $hasPhoto, 'photo_synced_at' => $now])->saveQuietly();
        }

        return $stored;
    }
}
