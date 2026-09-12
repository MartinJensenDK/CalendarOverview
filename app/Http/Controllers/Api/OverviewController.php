<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GroupResolver;
use App\Services\PhotoSyncService;
use App\Services\ScheduleService;
use App\Support\Preferences;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OverviewController extends Controller
{
    public function index(Request $request, GroupResolver $resolver, ScheduleService $schedules, PhotoSyncService $photos): JsonResponse
    {
        $user = $request->user();
        $prefs = $user->prefs();
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'days' => ['nullable', 'integer', 'min:1', 'max:'.config('calendar.max_days')],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in(Preferences::PAGE_SIZES)],
            'tz' => ['nullable', 'string', 'timezone:all'],
            'refresh' => ['nullable', 'boolean'],
        ]);

        $tz = $data['tz'] ?? 'UTC';
        $days = (int) ($data['days'] ?? $prefs['days']);
        $from = CarbonImmutable::parse($data['from'] ?? 'today', $tz)->startOfDay();
        $to = $from->addDays($days);
        $perPage = (int) ($data['per_page'] ?? $prefs['page_size']);
        $page = (int) ($data['page'] ?? 1);

        $all = $resolver->visibleUsers($user);
        $total = $all->count();
        $pageUsers = $all->slice(($page - 1) * $perPage, $perPage)->values();

        $photos->ensure($user, $pageUsers);
        $result = $schedules->itemsFor($user, $pageUsers, $from, $to, $tz, (bool) ($data['refresh'] ?? false));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'days' => $schedules->days($from, $to, $tz),
            'tz' => $tz,
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'fetched_at' => $result['fetched_at'],
            'users' => $pageUsers->map(fn ($u) => $u->toSummary() + [
                'is_me' => $u->id === $user->entra_id,
                'items' => $result['items'][$u->id] ?? [],
                'error' => $result['errors'][$u->id] ?? null,
            ])->values(),
        ]);
    }
}
