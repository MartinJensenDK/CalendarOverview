<?php

namespace App\Http\Controllers\Api;

use App\Graph\GraphException;
use App\Graph\GraphTokenProvider;
use App\Http\Controllers\Controller;
use App\Models\ColorRule;
use App\Models\DirectoryUser;
use App\Services\DemoDataService;
use App\Services\DirectorySyncService;
use App\Services\GroupResolver;
use App\Services\PhotoSyncService;
use App\Support\Preferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request, DirectorySyncService $directory, GroupResolver $groups, DemoDataService $demo, GraphTokenProvider $tokens, PhotoSyncService $photos): JsonResponse
    {
        $user = $request->user();
        $directoryError = null;
        try {
            $directory->syncIfStale($user);
        } catch (GraphException $e) {
            $directoryError = ['status' => $e->status, 'code' => $e->graphCode, 'message' => $e->getMessage()];
        }

        $prefs = $user->prefs();
        if ($prefs['demo_enabled'] && ! $demo->isSeeded()) {
            $demo->seed();
        }

        // Keep the signed-in user's own photo fresh; it is shown in the top bar.
        $meDir = DirectoryUser::find($user->entra_id);
        if ($meDir) {
            $retryMissing = ! $meDir->has_photo && (! $meDir->photo_synced_at || $meDir->photo_synced_at->lt(now()->subHour()));
            $photos->ensure($user, collect([$meDir]), force: $retryMissing);
        }

        return response()->json([
            'user' => [
                'id' => $user->entra_id,
                'name' => $user->name,
                'email' => $user->email,
                'given_name' => $user->given_name,
                'title' => $user->job_title,
                'photo_url' => $meDir ? $meDir->toSummary()['photo_url'] : '/api/photos/'.rawurlencode($user->entra_id),
                'has_manager' => (bool) $user->manager_entra_id,
                'scopes' => preg_split('/\s+/', (string) $user->granted_scopes, -1, PREG_SPLIT_NO_EMPTY),
            ],
            'preferences' => $prefs,
            'options' => [
                'themes' => Preferences::THEMES,
                'locales' => Preferences::LOCALES,
                'row_heights' => Preferences::ROW_HEIGHTS,
                'day_options' => Preferences::DAY_OPTIONS,
                'max_days' => config('calendar.max_days'),
                'statuses' => ColorRule::STATUSES,
            ],
            'color_rules' => $user->colorRules->map->toArray()->values(),
            'menu' => $groups->menu($user),
            'directory' => $directory->stats() + ['error' => $directoryError],
            'app' => [
                'name' => config('app.name'),
                'version' => config('calendar.version', '1.0.0'),
                'admin_consent_url' => $tokens->isConfigured() ? $tokens->adminConsentUrl(url('/auth/consented')) : null,
            ],
        ]);
    }
}
