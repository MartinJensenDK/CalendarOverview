<?php

namespace App\Http\Controllers;

use App\Services\InstallService;
use App\Support\EnvWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * First-run wizard: site name, database and Microsoft 365 settings.
 */
class SetupController extends Controller
{
    public function __construct(private readonly InstallService $installer) {}

    public function show(Request $request): View
    {
        return view('setup.index', [
            'values' => $this->installer->currentValues($request),
            'envWritable' => EnvWriter::forApp()->isWritable(),
            'envPath' => EnvWriter::forApp()->path(),
            'redirectUri' => rtrim($request->getSchemeAndHttpHost(), '/').'/auth/callback',
            'permissions' => config('calendar.scopes'),
            'checks' => $this->installer->checks(),
        ]);
    }

    public function testDatabase(Request $request): JsonResponse
    {
        $data = $request->validate(InstallService::databaseRules());

        return response()->json($this->installer->testDatabase($data));
    }

    public function finish(Request $request): RedirectResponse|JsonResponse
    {
        $data = $request->validate(InstallService::rules());

        try {
            $this->installer->install($data);
        } catch (\Throwable $e) {
            return back()->withInput()->withErrors(['install' => $e->getMessage()]);
        }

        return redirect('/login')->with('auth_info', __('Setup complete. Sign in with your Microsoft 365 account.'));
    }
}
