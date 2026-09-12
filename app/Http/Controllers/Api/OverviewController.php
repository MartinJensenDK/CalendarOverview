<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GroupResolver;
use App\Services\PhotoSyncService;
use App\Services\ScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverviewController extends Controller
{
    public function index(Request $request, GroupResolver $resolver, ScheduleService $schedules, PhotoSyncService $photos): JsonResponse
    {
        $user = $request->user();
        $prefs = $user->prefs();
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'days' => ['nullable', 'integer', 'min:1', 'max:'.config('calendar.max_days')],
            'tz' => ['nullable', 'string', 'timezone:all'],
            'refresh' => ['nullable', 'boolean'],
        ]);

        $tz = $data['tz'] ?? 'UTC';
        $days = (int) ($data['days'] ?? $prefs['days']);
        $from = CarbonImmutable::parse($data['from'] ?? 'today', $tz)->startOfDay();
        $to = $from->addDays($days);
        // Every visible person is returned at once; the grid scrolls instead of paging.
        $users = $resolver->visibleUsers($user)->values();

        $photos->ensure($user, $users);
        $result = $schedules->itemsFor($user, $users, $from, $to, $tz, (bool) ($data['refresh'] ?? false));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'days' => $schedules->days($from, $to, $tz),
            'tz' => $tz,
            'total' => $users->count(),
            'fetched_at' => $result['fetched_at'],
            'users' => $users->map(fn ($u) => $u->toSummary() + [
                'is_me' => $u->id === $user->entra_id,
                'items' => $result['items'][$u->id] ?? [],
                'error' => $result['errors'][$u->id] ?? null,
            ])->values(),
        ]);
    }
}
