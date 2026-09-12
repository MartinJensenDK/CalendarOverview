<?php

use App\Graph\GraphException;
use App\Graph\ReauthRequiredException;
use App\Http\Middleware\EnsureInstalled;
use App\Http\Middleware\TouchLastSeen;
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
        $middleware->web(prepend: [EnsureInstalled::class], append: [TouchLastSeen::class]);
        $middleware->trustProxies(at: '*');
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
