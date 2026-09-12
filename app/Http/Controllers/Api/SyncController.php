<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DirectorySyncService;
use App\Services\GroupResolver;
use App\Services\PhotoSyncService;
use App\Services\ScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function directory(Request $request, DirectorySyncService $directory, GroupResolver $groups): JsonResponse
    {
        $user = $request->user();
        $count = $directory->sync($user);
        $directory->syncManagerOf($user);
        foreach ($user->groups()->where('type', 'entra')->get() as $group) {
            $groups->syncEntraMembers($user, $group, force: true);
        }

        return response()->json(['directory' => $directory->stats(), 'count' => $count, 'menu' => $groups->menu($user)]);
    }

    public function photos(Request $request, GroupResolver $groups, PhotoSyncService $photos): JsonResponse
    {
        $user = $request->user();
        $stored = $photos->ensure($user, $groups->visibleUsers($user)->take(PhotoSyncService::MAX_PER_REQUEST), force: true);

        return response()->json(['stored' => $stored]);
    }

    public function schedule(Request $request, GroupResolver $groups, ScheduleService $schedules): JsonResponse
    {
        $user = $request->user();
        $ids = $groups->visibleUsers($user)->pluck('id')->all();
        $schedules->forget($ids);

        return response()->json(['cleared' => count($ids)]);
    }
}
