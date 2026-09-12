<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DemoDataService;
use App\Services\GroupResolver;
use App\Support\Preferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function update(Request $request, DemoDataService $demo, GroupResolver $groups): JsonResponse
    {
        $data = $request->validate(Preferences::rules());
        $user = $request->user();
        $before = $user->prefs();
        $user->forceFill(['preferences' => Preferences::merge(array_merge($before, $data))])->save();
        $after = $user->prefs();

        if ($after['demo_enabled'] && ! $demo->isSeeded()) {
            $demo->seed();
        }

        $menuChanged = $before['demo_enabled'] !== $after['demo_enabled']
            || $before['demo_visible'] !== $after['demo_visible']
            || $before['my_team_visible'] !== $after['my_team_visible'];

        return response()->json([
            'preferences' => $after,
            'menu' => $menuChanged ? $groups->menu($user) : null,
        ]);
    }
}
