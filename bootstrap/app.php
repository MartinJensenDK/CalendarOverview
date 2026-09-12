<?php

use App\Graph\GraphException;
use App\Graph\ReauthRequiredException;
use App\Http\Middleware\EnsureInstalled;
use App\Http\Middleware\RevalidateMicrosoftSession;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\TouchLastSeen;
use App\Support\Installer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(prepend: [SecurityHeaders::class, EnsureInstalled::class], append: [RevalidateMicrosoftSession::class, TouchLastSeen::class]);

        // Only honour X-Forwarded-* from proxies listed in TRUSTED_PROXIES ("*" = any). The scheme is
        // forced from APP_URL anyway, so a plain PHP-FPM behind nginx needs no trusted proxy at all.
        $proxies = array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '')))));
        if ($proxies !== []) {
            $middleware->trustProxies(at: in_array('*', $proxies, true) ? '*' : $proxies);
        }
        // Once installed, generated links only ever use the host from APP_URL (no Host-header poisoning).
        $middleware->trustHosts(at: function () {
            $host = parse_url((string) config('app.url'), PHP_URL_HOST);

            return Installer::isInstalled() && is_string($host) && $host !== '' ? [$host] : [];
        }, subdomains: false);
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : route('login'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (ReauthRequiredException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['error' => 'reauth', 'message' => $e->getMessage(), 'login_url' => url('/auth/login')], 401);
            }

            return redirect()->route('login')->with('auth_error', $e->getMessage());
        });

        $exceptions->render(function (GraphException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'error' => 'graph',
                    'status' => $e->status,
                    'code' => $e->graphCode,
                    'message' => $e->getMessage(),
                    'consent_required' => $e->isConsentError(),
                ], $e->isAuthError() ? 401 : 502);
            }

            return null;
        });
    })->create();
