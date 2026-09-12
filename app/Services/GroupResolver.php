<?php

namespace App\Services;

use App\Graph\GraphException;
use App\Graph\GraphTokenProvider;
use App\Models\DirectoryUser;
use App\Models\Group;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Turns groups (built-in and user-created) into lists of directory users.
 */
class GroupResolver
{
    public const MY_TEAM = 'my_team';

    public const DEMO_TEAM = 'demo_team';

    public function __construct(
        private readonly DirectorySyncService $directory,
        private readonly GraphTokenProvider $tokens,
        private readonly DemoDataService $demo,
    ) {}

    /** People with the same manager as the signed-in user, plus the user. */
    public function myTeam(User $actor): Collection
    {
        $query = DirectoryUser::query()->where('account_enabled', true)->where('is_demo', false);
        if ($actor->manager_entra_id) {
            $query->where(fn ($q) => $q->where('manager_id', $actor->manager_entra_id)->orWhere('id', $actor->entra_id));
        } else {
            $query->where('id', $actor->entra_id);
        }

        return $this->sorted($query->get(), $actor);
    }

    public function demoTeam(): Collection
    {
        return DirectoryUser::where('is_demo', true)->orderBy('display_name')->get();
    }

    public function membersOf(User $actor, Group $group): Collection
    {
        if ($group->type === Group::TYPE_ENTRA) {
            try {
                $this->syncEntraMembers($actor, $group);
            } catch (GraphException $e) {
                Log::info('Entra group sync failed, using cached members', ['group' => $group->id, 'status' => $e->status, 'code' => $e->graphCode]);
            }

            return $this->sorted($group->members()->where('account_enabled', true)->get(), $actor);
        }

        $ids = $group->members()->pluck('directory_users.id')->all();
        foreach ($group->managers()->pluck('directory_users.id') as $managerId) {
            if (DemoDataService::isDemoId($managerId)) {
                $ids = array_merge($ids, DirectoryUser::where('manager_id', $managerId)->pluck('id')->all());

                continue;
            }
            try {
                $ids = array_merge($ids, $this->directory->directReports($actor, $managerId));
            } catch (GraphException $e) {
                Log::info('directReports failed', ['manager' => $managerId, 'status' => $e->status]);
            }
        }

        return $this->sorted(DirectoryUser::whereIn('id', array_values(array_unique($ids)))->where('account_enabled', true)->get(), $actor);
    }

    /** All users that should appear in the overview, in menu order, without duplicates. */
    public function visibleUsers(User $actor): Collection
    {
        $prefs = $actor->prefs();
        $all = collect();
        if ($prefs['my_team_visible']) {
            $all = $all->concat($this->myTeam($actor));
        }
        foreach ($actor->groups()->where('visible', true)->get() as $group) {
            $all = $all->concat($this->membersOf($actor, $group));
        }
        if ($prefs['demo_enabled'] && $prefs['demo_visible']) {
            $all = $all->concat($this->demoTeam());
        }

        return $all->unique('id')->values();
    }

    /** Structure for the side menu. */
    public function menu(User $actor): array
    {
        $prefs = $actor->prefs();
        $entries = [[
            'id' => self::MY_TEAM,
            'kind' => 'builtin',
            'type' => 'my_team',
            'name' => null,
            'visible' => (bool) $prefs['my_team_visible'],
            'members' => $this->myTeam($actor)->map->toSummary()->values()->all(),
            'has_manager' => (bool) $actor->manager_entra_id,
        ]];

        foreach ($actor->groups as $group) {
            $entries[] = $this->groupEntry($actor, $group);
        }

        if ($prefs['demo_enabled']) {
            $entries[] = [
                'id' => self::DEMO_TEAM,
                'kind' => 'builtin',
                'type' => 'demo',
                'name' => null,
                'visible' => (bool) $prefs['demo_visible'],
                'members' => $this->demoTeam()->map->toSummary()->values()->all(),
            ];
        }

        return $entries;
    }

    public function groupEntry(User $actor, Group $group): array
    {
        $members = $this->membersOf($actor, $group);

        return [
            'id' => $group->id,
            'kind' => 'group',
            'type' => $group->type,
            'name' => $group->name,
            'visible' => (bool) $group->visible,
            'sort_order' => (int) $group->sort_order,
            'entra_group_id' => $group->entra_group_id,
            'entra_group_name' => $group->entra_group_name,
            'members_synced_at' => $group->members_synced_at?->toIso8601String(),
            'manual_members' => $group->type === Group::TYPE_MANUAL ? $group->members()->get()->map->toSummary()->values()->all() : [],
            'managers' => $group->managers()->get()->map->toSummary()->values()->all(),
            'members' => $members->map->toSummary()->values()->all(),
        ];
    }

    /** Refresh cached Entra group members when stale. */
    public function syncEntraMembers(User $actor, Group $group, bool $force = false): void
    {
        if (! $group->entra_group_id) {
            return;
        }
        $stale = ! $group->members_synced_at || $group->members_synced_at->lt(Carbon::now()->subHours(config('calendar.group_sync_hours')));
        if (! $force && ! $stale) {
            return;
        }

        $graph = $this->tokens->client($actor);
        $members = $graph->getAll('/groups/'.rawurlencode($group->entra_group_id).'/transitiveMembers/microsoft.graph.user', [
            '$select' => 'id',
            '$count' => 'true',
            '$top' => 999,
        ], ['ConsistencyLevel' => 'eventual']);
        $ids = array_column($members, 'id');

        DB::transaction(function () use ($group, $ids) {
            $known = DirectoryUser::whereIn('id', $ids)->pluck('id')->all();
            DB::table('group_members')->where('group_id', $group->id)->delete();
            foreach (array_chunk($known, 500) as $chunk) {
                DB::table('group_members')->insert(array_map(fn ($id) => ['group_id' => $group->id, 'directory_user_id' => $id], $chunk));
            }
            $group->forceFill(['members_synced_at' => Carbon::now()])->save();
        });
    }

    private function sorted(Collection $users, User $actor): Collection
    {
        return $users->sortBy([
            fn (DirectoryUser $a, DirectoryUser $b) => ($b->id === $actor->entra_id) <=> ($a->id === $actor->entra_id),
            fn (DirectoryUser $a, DirectoryUser $b) => strcasecmp($a->display_name, $b->display_name),
        ])->values();
    }
}
