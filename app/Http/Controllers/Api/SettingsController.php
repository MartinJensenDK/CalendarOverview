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
        return $this->apply($request, $request->validate(Preferences::rules()), $demo, $groups);
    }

    /** Resets only the preferences that live on the Settings page; groups, rules and menu state are kept. */
    public function reset(Request $request, DemoDataService $demo, GroupResolver $groups): JsonResponse
    {
        $defaults = array_intersect_key(Preferences::defaults(), array_flip(Preferences::SETTINGS_PAGE));

        return $this->apply($request, $defaults, $demo, $groups);
    }

    private function apply(Request $request, array $data, DemoDataService $demo, GroupResolver $groups): JsonResponse
    {
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
