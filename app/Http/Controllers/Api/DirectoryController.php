<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DirectoryUser;
use App\Models\SyncState;
use App\Services\DirectorySyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DirectoryController extends Controller
{
    public function users(Request $request, DirectorySyncService $directory): JsonResponse
    {
        $user = $request->user();
        $directory->syncIfStale($user);
        // Demo people are searchable only while demo data is on; the person lookup also
        // hides them when the Demo team is hidden in the menu.
        $includeDemo = (bool) $user->pref('demo_enabled')
            && ($request->query('context') !== 'lookup' || (bool) $user->pref('demo_visible'));
        $users = $directory->search((string) $request->query('q', ''), $includeDemo, 25);

        return response()->json(['users' => $users->map->toSummary()->values()]);
    }

    /** Users that have direct reports (for "add everyone reporting to …"). */
    public function managers(Request $request, DirectorySyncService $directory): JsonResponse
    {
        $user = $request->user();
        $directory->syncIfStale($user);
        $includeDemo = (bool) $user->pref('demo_enabled');
        $users = $directory->search((string) $request->query('q', ''), $includeDemo, 200);

        if (SyncState::get('directory_has_managers') === '1') {
            $managerIds = DirectoryUser::whereNotNull('manager_id')->distinct()->pluck('manager_id')->flip();
            $users = $users->filter(fn (DirectoryUser $u) => $managerIds->has($u->id) || ($u->is_demo && $u->job_title && str_starts_with($u->job_title, 'Head of')) || ($u->is_demo && $u->job_title === 'CEO'));
        }

        return response()->json(['users' => $users->take(25)->map->toSummary()->values()]);
    }
}
