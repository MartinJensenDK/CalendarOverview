@extends('layouts.base')
@section('title', __('Calendar overview').' · '.config('app.name'))
@push('head')
  <script type="importmap">@json($importMap)</script>
  <script>window.__APP__ = @json($boot);</script>
@endpush
@section('body')
  <div id="app"></div>
  <script src="{{ asset('assets/vendor/vue.global.prod.js') }}?v=3.5.13"></script>
  <script type="module" src="{{ asset('assets/js/app.js') }}?v={{ $version }}"></script>
@endsection
