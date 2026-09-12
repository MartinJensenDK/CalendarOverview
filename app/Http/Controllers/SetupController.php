<?php

namespace App\Http\Controllers;

use App\Services\InstallService;
use App\Support\EnvWriter;
use App\Support\Installer;
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

    private const UNLOCKED = 'setup_unlocked';

    public function show(Request $request): View|RedirectResponse
    {
        if ($request->filled('token') && Installer::verifySetupToken($request->query('token'))) {
            $request->session()->put(self::UNLOCKED, true);

            return redirect('/setup');
        }
        if (! $request->session()->get(self::UNLOCKED)) {
            Installer::setupToken(); // make sure the file exists so the admin has something to copy

            return view('setup.unlock', ['tokenPath' => Installer::setupTokenFile()]);
        }

        return view('setup.index', [
            'values' => $this->installer->currentValues($request),
            'envWritable' => EnvWriter::forApp()->isWritable(),
            'envPath' => EnvWriter::forApp()->path(),
            'redirectUri' => rtrim($request->getSchemeAndHttpHost(), '/').'/auth/callback',
            'permissions' => config('calendar.scopes'),
            'checks' => $this->installer->checks(),
        ]);
    }

    public function unlock(Request $request): RedirectResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:120']]);
        if (! Installer::verifySetupToken($data['token'])) {
            return back()->withErrors(['token' => __('That token does not match. Copy it from :path on the server.', ['path' => Installer::setupTokenFile()])]);
        }
        $request->session()->put(self::UNLOCKED, true);

        return redirect('/setup');
    }

    public function testDatabase(Request $request): JsonResponse
    {
        abort_unless($request->session()->get(self::UNLOCKED), 403);
        $data = $request->validate(InstallService::databaseRules());

        return response()->json($this->installer->testDatabase($data));
    }

    public function finish(Request $request): RedirectResponse|JsonResponse
    {
        abort_unless($request->session()->get(self::UNLOCKED), 403);
        $data = $request->validate(InstallService::rules());

        try {
            $this->installer->install($data);
        } catch (\Throwable $e) {
            // Secrets are never flashed back into the session or the page.
            return back()->withInput($request->except(['db_password', 'ms_client_secret']))->withErrors(['install' => $e->getMessage()]);
        }
        $request->session()->forget(self::UNLOCKED);

        return redirect('/login')->with('auth_info', __('Setup complete. Sign in with your Microsoft 365 account.'));
    }
}
