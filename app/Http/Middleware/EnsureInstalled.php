<?php

namespace App\Http\Middleware;

use App\Support\Installer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureInstalled
{
    public function handle(Request $request, Closure $next): Response
    {
        $isSetupRoute = $request->is('setup') || $request->is('setup/*');

        if (! Installer::isInstalled()) {
            if ($isSetupRoute || $request->is('up')) {
                return $next($request);
            }
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['error' => 'not_installed', 'setup_url' => url('/setup')], 503);
            }

            return redirect('/setup');
        }

        if ($isSetupRoute) {
            abort(404);
        }

        return $next($request);
    }
}
