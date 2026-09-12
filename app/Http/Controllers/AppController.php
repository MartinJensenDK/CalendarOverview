<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\View\View;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

class AppController extends Controller
{
    public function index(Request $request): View
    {
        $prefs = $request->user()->prefs();
        $version = config('calendar.version');

        return view('app', [
            'theme' => $prefs['theme'],
            'locale' => $prefs['locale'],
            'version' => $version,
            'importMap' => ['imports' => $this->importMap($version)],
            'boot' => [
                'csrf' => csrf_token(),
                'locale' => $prefs['locale'],
                'theme' => $prefs['theme'],
                'menuCollapsed' => (bool) $prefs['menu_collapsed'],
                'appName' => config('app.name'),
                'version' => $version,
                'logoutUrl' => route('logout'),
                'loginUrl' => route('auth.redirect'),
            ],
        ]);
    }

    /**
     * Maps every ES module to a versioned URL so browsers with long-lived asset
     * caching (nginx "expires max") pick up new releases immediately.
     */
    private function importMap(string $version): array
    {
        $base = public_path('assets/js');
        $map = [];
        if (! is_dir($base)) {
            return $map;
        }
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->getExtension() !== 'js') {
                continue;
            }
            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($base) + 1));
            $url = asset('assets/js/'.$relative);
            $map[$url] = $url.'?v='.$version;
        }
        ksort($map);

        return $map;
    }
}
