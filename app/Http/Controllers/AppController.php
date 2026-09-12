<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\View\View;

class AppController extends Controller
{
    public function index(Request $request): View
    {
        $prefs = $request->user()->prefs();

        return view('app', [
            'theme' => $prefs['theme'],
            'locale' => $prefs['locale'],
            'boot' => [
                'csrf' => csrf_token(),
                'locale' => $prefs['locale'],
                'theme' => $prefs['theme'],
                'menuCollapsed' => (bool) $prefs['menu_collapsed'],
                'appName' => config('app.name'),
                'version' => config('calendar.version'),
                'logoutUrl' => route('logout'),
                'loginUrl' => route('auth.redirect'),
            ],
        ]);
    }
}
