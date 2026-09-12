<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DirectoryUser;
use App\Services\ScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    public function index(Request $request, ScheduleService $schedules): JsonResponse
    {
        $data = $request->validate([
            'users' => ['required', 'array', 'min:1', 'max:200'],
            'users.*' => ['string', 'max:64'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'tz' => ['nullable', 'string', 'timezone:all'],
            'refresh' => ['nullable', 'boolean'],
        ]);
        $tz = $data['tz'] ?? 'UTC';
        $from = CarbonImmutable::parse($data['from'], $tz)->startOfDay();
        $to = CarbonImmutable::parse($data['to'], $tz)->startOfDay();
        abort_if($from->diffInDays($to) > config('calendar.max_days'), 422, 'Range too long');

        $users = DirectoryUser::whereIn('id', $data['users'])->get();
        if (! $request->user()->pref('demo_enabled')) {
            $users = $users->reject(fn (DirectoryUser $u) => $u->is_demo)->values();
        }
        $result = $schedules->itemsFor($request->user(), $users, $from, $to, $tz, (bool) ($data['refresh'] ?? false));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'days' => $schedules->days($from, $to, $tz),
            'fetched_at' => $result['fetched_at'],
            'users' => $users->map(fn (DirectoryUser $u) => $u->toSummary() + [
                'items' => $result['items'][$u->id] ?? [],
                'work' => $result['work'][$u->id] ?? [],
                'error' => $result['errors'][$u->id] ?? null,
            ])->values(),
        ]);
    }
}
