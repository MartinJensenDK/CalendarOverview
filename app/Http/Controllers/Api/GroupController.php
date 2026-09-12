<?php

namespace App\Http\Controllers\Api;

use App\Graph\GraphException;
use App\Http\Controllers\Controller;
use App\Http\Requests\GroupRequest;
use App\Models\Group;
use App\Services\GroupResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GroupController extends Controller
{
    public function __construct(private readonly GroupResolver $resolver) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['menu' => $this->resolver->menu($request->user())]);
    }

    public function store(GroupRequest $request): JsonResponse
    {
        $user = $request->user();
        $group = DB::transaction(function () use ($request, $user) {
            $group = $user->groups()->create([
                'name' => $request->input('name'),
                'type' => $request->input('type'),
                'entra_group_id' => $request->input('type') === Group::TYPE_ENTRA ? $request->input('entra_group_id') : null,
                'entra_group_name' => $request->input('type') === Group::TYPE_ENTRA ? $request->input('entra_group_name') : null,
                'visible' => $request->boolean('visible', true),
                'sort_order' => ((int) $user->groups()->max('sort_order')) + 1,
            ]);
            $this->syncMembership($group, $request);

            return $group;
        });

        return $this->respond($request, $group, 201);
    }

    public function update(GroupRequest $request, Group $group): JsonResponse
    {
        $this->authorizeOwner($request, $group);
        DB::transaction(function () use ($request, $group) {
            $group->fill([
                'name' => $request->input('name'),
                'type' => $request->input('type'),
                'entra_group_id' => $request->input('type') === Group::TYPE_ENTRA ? $request->input('entra_group_id') : null,
                'entra_group_name' => $request->input('type') === Group::TYPE_ENTRA ? $request->input('entra_group_name') : null,
            ]);
            if ($group->isDirty('entra_group_id')) {
                $group->members_synced_at = null;
            }
            $group->save();
            $this->syncMembership($group, $request);
        });

        return $this->respond($request, $group);
    }

    public function destroy(Request $request, Group $group): JsonResponse
    {
        $this->authorizeOwner($request, $group);
        $group->delete();

        return response()->json(['menu' => $this->resolver->menu($request->user())]);
    }

    public function toggle(Request $request, Group $group): JsonResponse
    {
        $this->authorizeOwner($request, $group);
        $group->forceFill(['visible' => $request->has('visible') ? $request->boolean('visible') : ! $group->visible])->save();

        return response()->json(['group' => ['id' => $group->id, 'visible' => $group->visible]]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']]);
        $user = $request->user();
        foreach (array_values($data['ids']) as $i => $id) {
            $user->groups()->where('id', $id)->update(['sort_order' => $i]);
        }

        return response()->json(['menu' => $this->resolver->menu($user)]);
    }

    public function resync(Request $request, Group $group): JsonResponse
    {
        $this->authorizeOwner($request, $group);
        $this->resolver->syncEntraMembers($request->user(), $group, force: true);

        return $this->respond($request, $group);
    }

    private function syncMembership(Group $group, GroupRequest $request): void
    {
        if ($group->type === Group::TYPE_MANUAL) {
            $group->members()->sync($request->input('members', []));
            $group->managers()->sync($request->input('managers', []));
        } else {
            $group->managers()->sync([]);
        }
    }

    private function respond(Request $request, Group $group, int $status = 200): JsonResponse
    {
        $warning = null;
        if ($group->type === Group::TYPE_ENTRA) {
            try {
                $this->resolver->syncEntraMembers($request->user(), $group, force: true);
            } catch (GraphException $e) {
                $warning = ['status' => $e->status, 'code' => $e->graphCode, 'message' => $e->getMessage(), 'consent_required' => $e->isConsentError()];
            }
        }

        return response()->json([
            'group' => $this->resolver->groupEntry($request->user(), $group->fresh()),
            'menu' => $this->resolver->menu($request->user()),
            'warning' => $warning,
        ], $status);
    }

    private function authorizeOwner(Request $request, Group $group): void
    {
        abort_unless($group->user_id === $request->user()->id, 404);
    }
}
