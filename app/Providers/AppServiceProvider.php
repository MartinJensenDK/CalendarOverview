<?php

namespace App\Providers;

use App\Support\KeyBootstrapper;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        KeyBootstrapper::ensureKey();
    }

    public function boot(): void
    {
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        $this->configureRateLimiting();
    }

    private function configureRateLimiting(): void
    {
        $byUserOrIp = fn (Request $request) => (string) ($request->user()?->id ?: $request->ip());

        // Sign-in and the setup wizard: unauthenticated, so keyed by client address.
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
        RateLimiter::for('setup', fn (Request $request) => Limit::perMinute(15)->by($request->ip()));

        // Everyday API traffic. The overview polls, so leave room for a busy screen.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by($byUserOrIp($request)));

        // Calls that fan out to Microsoft Graph for many people at once.
        RateLimiter::for('heavy', fn (Request $request) => $request->boolean('refresh')
            ? Limit::perMinute(10)->by('refresh:'.$byUserOrIp($request))
            : Limit::none());
        RateLimiter::for('sync', fn (Request $request) => Limit::perMinute(6)->by($byUserOrIp($request)));
    }
}
