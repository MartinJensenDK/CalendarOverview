<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DirectoryUser;
use App\Services\GroupResolver;
use App\Services\ScheduleService;
use App\Services\VacationDetector;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vacation periods for everyone in the overview, for the vacation calendar. */
class VacationController extends Controller
{
    public function index(Request $request, GroupResolver $resolver, ScheduleService $schedules): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after:from'],
            'days' => ['nullable', 'integer', 'min:1', 'max:'.config('calendar.max_days')],
            'tz' => ['nullable', 'string', 'timezone:all'],
            'refresh' => ['nullable', 'boolean'],
        ]);
        $tz = $data['tz'] ?? 'UTC';
        // Explicit start and end dates win; otherwise the current month plus the chosen span.
        $from = isset($data['from']) ? CarbonImmutable::parse($data['from'], $tz)->startOfDay() : CarbonImmutable::now($tz)->startOfMonth();
        $to = isset($data['to']) ? CarbonImmutable::parse($data['to'], $tz)->startOfDay()->addDay() : $from->addDays((int) ($data['days'] ?? 92));
        abort_if($from->diffInDays($to) > config('calendar.max_days'), 422, 'Range too long');

        $user = $request->user();
        $users = $resolver->visibleUsers($user)->values();
        $result = $schedules->itemsFor($user, $users, $from, $to, $tz, (bool) ($data['refresh'] ?? false));

        $rows = $users->map(fn (DirectoryUser $u) => $u->toSummary() + [
            'is_me' => $u->id === $user->entra_id,
            'periods' => VacationDetector::periods($result['items'][$u->id] ?? [], $tz),
            'error' => $result['errors'][$u->id] ?? null,
        ]);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->subDay()->toDateString(), // inclusive last day
            'tz' => $tz,
            'fetched_at' => $result['fetched_at'],
            'users' => $rows->filter(fn ($r) => $r['periods'] !== [])->sortBy(fn ($r) => $r['periods'][0]['from'])->values(),
            'without' => $rows->filter(fn ($r) => $r['periods'] === [])->count(),
        ]);
    }
}
