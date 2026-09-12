@extends('layouts.base', ['theme' => 'system'])
@section('title', __('Setup').' · '.__('Calendar overview'))
@section('body')
<main class="page">
  <form class="card" method="post" action="{{ url('/setup/unlock') }}" autocomplete="off">
    @csrf
    <div class="brand-lg"><div class="brand-mark">C</div><span>{{ __('Calendar overview') }}</span></div>
    <h1>{{ __('Unlock the setup') }}</h1>
    <p class="lead">{{ __('This site has not been set up yet. To prove you run the server, paste the token from this file:') }}</p>
    <pre class="mono" style="white-space:pre-wrap;word-break:break-all">{{ $tokenPath }}</pre>
    <p class="modal-note">{{ __('Print it with: php artisan calendar:install --token') }}</p>

    @if($errors->any())
      <div class="callout danger">
        @foreach($errors->all() as $e)<div>{{ $e }}</div>@endforeach
      </div>
    @endif

    <label class="field"><span>{{ __('Setup token') }}</span><input class="input mono" name="token" required maxlength="120" autofocus></label>
    <div class="row">
      <span class="grow"></span>
      <button type="submit" class="btn primary">{{ __('Continue') }}</button>
    </div>
  </form>
</main>
@endsection
