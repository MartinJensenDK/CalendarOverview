<?php

use App\Http\Controllers\Api;
use App\Http\Controllers\AppController;
use App\Http\Controllers\MicrosoftAuthController;
use App\Http\Controllers\SetupController;
use Illuminate\Support\Facades\Route;

// First-run setup wizard (only reachable until the install lock exists, see EnsureInstalled).
Route::get('/setup', [SetupController::class, 'show'])->name('setup');
Route::post('/setup/test-database', [SetupController::class, 'testDatabase']);
Route::post('/setup', [SetupController::class, 'finish']);

// Microsoft 365 sign-in
Route::get('/login', [MicrosoftAuthController::class, 'showLogin'])->name('login');
Route::get('/auth/login', [MicrosoftAuthController::class, 'redirect'])->name('auth.redirect');
Route::get('/auth/callback', [MicrosoftAuthController::class, 'callback']);
Route::get('/auth/consented', [MicrosoftAuthController::class, 'consented']);
Route::post('/auth/logout', [MicrosoftAuthController::class, 'logout'])->name('logout');

Route::middleware('auth')->group(function () {
    Route::get('/', [AppController::class, 'index'])->name('app');

    Route::prefix('api')->group(function () {
        Route::get('/me', [Api\MeController::class, 'show']);
        Route::put('/settings', [Api\SettingsController::class, 'update']);
        Route::post('/settings/reset', [Api\SettingsController::class, 'reset']);

        Route::get('/directory/users', [Api\DirectoryController::class, 'users']);
        Route::get('/directory/managers', [Api\DirectoryController::class, 'managers']);
        Route::get('/entra/groups', [Api\EntraGroupController::class, 'search']);
        Route::get('/entra/groups/{id}/count', [Api\EntraGroupController::class, 'count']);

        Route::get('/groups', [Api\GroupController::class, 'index']);
        Route::post('/groups', [Api\GroupController::class, 'store']);
        Route::post('/groups/reorder', [Api\GroupController::class, 'reorder']);
        Route::put('/groups/{group}', [Api\GroupController::class, 'update']);
        Route::delete('/groups/{group}', [Api\GroupController::class, 'destroy']);
        Route::post('/groups/{group}/toggle', [Api\GroupController::class, 'toggle']);
        Route::post('/groups/{group}/resync', [Api\GroupController::class, 'resync']);

        Route::get('/color-rules', [Api\ColorRuleController::class, 'index']);
        Route::post('/color-rules', [Api\ColorRuleController::class, 'store']);
        Route::post('/color-rules/reorder', [Api\ColorRuleController::class, 'reorder']);
        Route::post('/color-rules/reset', [Api\ColorRuleController::class, 'reset']);
        Route::put('/color-rules/{colorRule}', [Api\ColorRuleController::class, 'update']);
        Route::delete('/color-rules/{colorRule}', [Api\ColorRuleController::class, 'destroy']);

        Route::get('/overview', [Api\OverviewController::class, 'index']);
        Route::get('/availability', [Api\AvailabilityController::class, 'index']);
        Route::get('/vacations', [Api\VacationController::class, 'index']);

        Route::post('/sync/directory', [Api\SyncController::class, 'directory']);
        Route::post('/sync/photos', [Api\SyncController::class, 'photos']);
        Route::post('/sync/schedule', [Api\SyncController::class, 'schedule']);

        Route::get('/photos/{id}', [Api\PhotoController::class, 'show'])->where('id', '[A-Za-z0-9\-_]+');
    });
});
