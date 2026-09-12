<?php

namespace App\Services;

use App\Graph\GraphClient;
use App\Graph\GraphException;
use App\Graph\GraphTokenProvider;
use App\Models\DirectoryUser;
use App\Models\SyncState;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Pulls the tenant's users (with manager) into directory_users.
 */
class DirectorySyncService
{
    public const SELECT = 'id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled,userType';

    public function __construct(private readonly GraphTokenProvider $tokens) {}

    public function lastSyncedAt(): ?Carbon
    {
        return SyncState::timestamp('directory_synced_at');
    }

    public function isStale(): bool
    {
        $last = $this->lastSyncedAt();

        return ! $last || $last->lt(Carbon::now()->subHours(config('calendar.directory_sync_hours')));
    }

    /** Sync when stale; never runs twice at the same time. Returns true when a sync ran. */
    public function syncIfStale(User $actor): bool
    {
        if (! $this->isStale()) {
            return false;
        }

        return (bool) Cache::lock('directory-sync', 120)->get(function () use ($actor) {
            if (! $this->isStale()) {
                return false;
            }
            $this->sync($actor);

            return true;
        });
    }

    /** Full sync of all member users. Returns number of users stored. */
    public function sync(User $actor, ?GraphClient $graph = null): int
    {
        $graph ??= $this->tokens->client($actor);
        $now = Carbon::now();

        try {
            $users = $graph->getAll('/users', [
                '$select' => self::SELECT,
                '$expand' => 'manager($select=id)',
                '$top' => 999,
            ]);
            $withManagers = true;
        } catch (GraphException $e) {
            if ($e->status !== 400) {
                throw $e;
            }
            Log::notice('Directory sync without manager expansion', ['message' => $e->getMessage()]);
            $users = $graph->getAll('/users', ['$select' => self::SELECT, '$top' => 999]);
            $withManagers = false;
        }

        $seen = [];
        foreach (array_chunk($users, 200) as $chunk) {
            $rows = [];
            foreach ($chunk as $u) {
                if (($u['userType'] ?? 'Member') !== 'Member') {
                    continue;
                }
                $seen[] = $u['id'];
                $rows[] = [
                    'id' => $u['id'],
                    'display_name' => $u['displayName'] ?? ($u['mail'] ?? $u['userPrincipalName'] ?? $u['id']),
                    'given_name' => $u['givenName'] ?? null,
                    'surname' => $u['surname'] ?? null,
                    'mail' => $u['mail'] ?? null,
                    'upn' => $u['userPrincipalName'] ?? null,
                    'job_title' => $u['jobTitle'] ?? null,
                    'department' => $u['department'] ?? null,
                    'office_location' => $u['officeLocation'] ?? null,
                    'manager_id' => $u['manager']['id'] ?? null,
                    'account_enabled' => (bool) ($u['accountEnabled'] ?? true),
                    'is_demo' => false,
                    'synced_at' => $now,
                    'updated_at' => $now,
                    'created_at' => $now,
                ];
            }
            if ($rows === []) {
                continue;
            }
            $update = ['display_name', 'given_name', 'surname', 'mail', 'upn', 'job_title', 'department', 'office_location', 'account_enabled', 'synced_at', 'updated_at'];
            if ($withManagers) {
                $update[] = 'manager_id';
            }
            DirectoryUser::upsert($rows, ['id'], $update);
        }

        // Users that disappeared from the tenant are disabled, not deleted (groups may still reference them).
        if ($seen !== []) {
            DirectoryUser::where('is_demo', false)
                ->where(fn ($q) => $q->whereNull('synced_at')->orWhere('synced_at', '<', $now))
                ->whereNotIn('id', $seen)
                ->update(['account_enabled' => false]);
        }

        SyncState::touchKey('directory_synced_at');
        SyncState::put('directory_has_managers', $withManagers ? '1' : '0');
        SyncState::put('directory_user_count', (string) count($seen));

        return count($seen);
    }

    /** Stores the signed-in user's manager (needed for "My team"). */
    public function syncManagerOf(User $user, ?GraphClient $graph = null): ?string
    {
        $graph ??= $this->tokens->client($user);
        try {
            $manager = $graph->get('/me/manager', ['$select' => 'id,displayName']);
            $managerId = $manager['id'] ?? null;
        } catch (GraphException $e) {
            if ($e->isNotFound()) {
                $managerId = null;
            } else {
                throw $e;
            }
        }

        $user->forceFill(['manager_entra_id' => $managerId])->save();
        DirectoryUser::where('id', $user->entra_id)->update(['manager_id' => $managerId]);

        return $managerId;
    }

    /** Direct reports of a user, from cache when managers were synced, otherwise from Graph. */
    public function directReports(User $actor, string $managerId): array
    {
        if (SyncState::get('directory_has_managers') === '1') {
            return DirectoryUser::where('manager_id', $managerId)->where('account_enabled', true)->pluck('id')->all();
        }

        return Cache::remember('direct-reports:'.$managerId, 3600, function () use ($actor, $managerId) {
            $graph = $this->tokens->client($actor);
            $reports = $graph->getAll('/users/'.rawurlencode($managerId).'/directReports/microsoft.graph.user', ['$select' => 'id']);
            $ids = array_column($reports, 'id');
            if ($ids !== []) {
                DirectoryUser::whereIn('id', $ids)->update(['manager_id' => $managerId]);
            }

            return $ids;
        });
    }

    /** Search cached users (used by the pickers). */
    public function search(string $query, bool $includeDemo, int $limit = 20)
    {
        $q = DirectoryUser::query()->where('account_enabled', true);
        if (! $includeDemo) {
            $q->where('is_demo', false);
        }
        $query = trim($query);
        if ($query !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $query).'%';
            $q->where(fn ($w) => $w->where('display_name', 'like', $like)
                ->orWhere('mail', 'like', $like)
                ->orWhere('job_title', 'like', $like)
                ->orWhere('department', 'like', $like));
        }

        return $q->orderBy('display_name')->limit($limit)->get();
    }

    public function stats(): array
    {
        return [
            'synced_at' => $this->lastSyncedAt()?->toIso8601String(),
            'user_count' => (int) SyncState::get('directory_user_count', DirectoryUser::where('is_demo', false)->count()),
            'has_managers' => SyncState::get('directory_has_managers') === '1',
        ];
    }

    public static function transaction(callable $fn): mixed
    {
        return DB::transaction($fn);
    }
}
