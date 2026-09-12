<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" data-theme="{{ $theme ?? 'light' }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <meta name="color-scheme" content="light dark">
  <title>@yield('title', config('app.name'))</title>
  <link rel="icon" href="{{ asset('assets/img/favicon.svg') }}" type="image/svg+xml">
  <link rel="stylesheet" href="{{ asset('assets/css/fonts.css') }}">
  <link rel="stylesheet" href="{{ asset('assets/css/theme.css') }}?v={{ config('calendar.version', '1') }}">
  @if(($theme ?? 'light') === 'system')
  <script>
    (function () {
      var stored = null;
      try { stored = localStorage.getItem('theme'); } catch (e) {}
      var mode = stored && stored !== 'system' ? stored : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', mode);
    })();
  </script>
  @endif
  @stack('head')
</head>
<body>
@yield('body')
@stack('scripts')
</body>
</html>
