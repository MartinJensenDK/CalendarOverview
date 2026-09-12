@extends('layouts.base')
@section('title', __('Calendar overview').' · '.config('app.name'))
@push('head')
  <script>window.__APP__ = @json($boot);</script>
@endpush
@section('body')
  <div id="app"></div>
  <script src="{{ asset('assets/vendor/vue.global.prod.js') }}"></script>
  <script type="module" src="{{ asset('assets/js/app.js') }}?v={{ config('calendar.version', '1') }}"></script>
@endsection
