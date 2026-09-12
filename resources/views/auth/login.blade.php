@extends('layouts.base', ['theme' => 'system'])
@section('title', __('Sign in').' · '.config('app.name'))
@section('body')
<main class="page">
  <div class="card">
    <div class="brand-lg"><div class="brand-mark">C</div><span>{{ config('app.name') }}</span></div>
    <h1>{{ __('Calendar overview') }}</h1>
    <p class="lead">{{ __('See your colleagues’ calendars side by side. Sign in with your work account; the app only reads calendars and never changes anything.') }}</p>

    @if($error)
      <div class="callout danger">{{ $error }}</div>
    @endif
    @if(session('auth_info'))
      <div class="callout ok">{{ session('auth_info') }}</div>
    @endif

    @if($configured)
      <a class="btn primary ms" href="{{ route('auth.redirect') }}">
        <svg viewBox="0 0 23 23" aria-hidden="true"><rect x="1" y="1" width="10" height="10" fill="#f35325"/><rect x="12" y="1" width="10" height="10" fill="#81bc06"/><rect x="1" y="12" width="10" height="10" fill="#05a6f0"/><rect x="12" y="12" width="10" height="10" fill="#ffba08"/></svg>
        {{ __('Sign in with Microsoft 365') }}
      </a>
      <p class="page-foot">{{ __('Read-only access to calendars, profiles and groups.') }}
        @if($adminConsentUrl)· <a href="{{ $adminConsentUrl }}">{{ __('Grant admin consent') }}</a>@endif
      </p>
    @else
      <div class="callout warn">{{ __('Microsoft sign-in is not configured yet. Add the tenant id, client id and client secret to the .env file (or run php artisan calendar:install) and reload this page.') }}</div>
    @endif
  </div>
</main>
@endsection
