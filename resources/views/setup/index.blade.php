@extends('layouts.base', ['theme' => 'system'])
@section('title', __('Setup').' · '.__('Calendar overview'))
@section('body')
<main class="page">
  <form class="card wide" method="post" action="{{ url('/setup') }}" id="setup" autocomplete="off">
    @csrf
    <div class="brand-lg"><div class="brand-mark">C</div><span>{{ __('Calendar overview') }}</span></div>
    <h1>{{ __('Set up your calendar overview') }}</h1>
    <p class="lead">{{ __('Three short steps: name the site, connect a database and add your Microsoft 365 app registration. Everything can be changed later in the .env file.') }}</p>

    @if($errors->any())
      <div class="callout danger">
        @foreach($errors->all() as $e)<div>{{ $e }}</div>@endforeach
      </div>
    @endif
    @unless($envWritable)
      <div class="callout danger">{{ __('The file :path is not writable. Make it writable for the web server user and reload.', ['path' => $envPath]) }}</div>
    @endunless

    <div class="steps" role="tablist">
      <button type="button" class="active" data-step="1">1 · {{ __('Site') }}</button>
      <button type="button" data-step="2">2 · {{ __('Database') }}</button>
      <button type="button" data-step="3">3 · {{ __('Microsoft 365') }}</button>
    </div>

    <section data-panel="1">
      <div class="checks">
        @foreach($checks as $c)<span class="{{ $c['ok'] ? '' : 'bad' }}">{{ $c['label'] }}</span>@endforeach
      </div>
      <label class="field"><span>{{ __('Site name') }}</span>
        <input class="input" name="app_name" required maxlength="80" value="{{ old('app_name', $values['app_name']) }}">
        <div class="field-hint">{{ __('Shown in the browser tab and on the sign-in page. The headline in the app stays “Calendar overview”.') }}</div>
      </label>
      <label class="field"><span>{{ __('Public address (URL)') }}</span>
        <input class="input" name="app_url" type="url" required value="{{ old('app_url', $values['app_url']) }}">
      </label>
      <label class="field"><span>{{ __('Default language') }}</span>
        <select class="select" name="app_locale">
          <option value="en" @selected(old('app_locale', $values['app_locale']) === 'en')>English</option>
          <option value="da" @selected(old('app_locale', $values['app_locale']) === 'da')>Dansk</option>
        </select>
      </label>
      <div class="row"><span class="grow"></span><button type="button" class="btn primary" data-next="2">{{ __('Next: database') }}</button></div>
    </section>

    <section data-panel="2" hidden>
      <label class="field"><span>{{ __('Database') }}</span>
        <select class="select" name="db_connection" id="db_connection">
          <option value="sqlite" @selected(old('db_connection', $values['db_connection']) === 'sqlite')>SQLite ({{ __('no configuration, fine for small teams') }})</option>
          <option value="mysql" @selected(old('db_connection', $values['db_connection']) === 'mysql')>MySQL</option>
          <option value="mariadb" @selected(old('db_connection', $values['db_connection']) === 'mariadb')>MariaDB</option>
          <option value="pgsql" @selected(old('db_connection', $values['db_connection']) === 'pgsql')>PostgreSQL</option>
        </select>
      </label>
      <div id="db-fields" class="grid-2">
        <label class="field"><span>{{ __('Host') }}</span><input class="input" name="db_host" value="{{ old('db_host', $values['db_host']) }}"></label>
        <label class="field"><span>{{ __('Port') }}</span><input class="input" name="db_port" type="number" value="{{ old('db_port', $values['db_port']) }}"></label>
        <label class="field"><span>{{ __('Database name') }}</span><input class="input" name="db_database" value="{{ old('db_database', $values['db_database']) }}"></label>
        <label class="field"><span>{{ __('User') }}</span><input class="input" name="db_username" value="{{ old('db_username', $values['db_username']) }}"></label>
        <label class="field"><span>{{ __('Password') }}</span><input class="input" name="db_password" type="password" value="{{ old('db_password') }}"></label>
      </div>
      <div id="db-result" class="callout" hidden></div>
      <div class="row">
        <button type="button" class="btn" data-next="1">{{ __('Back') }}</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="test-db">{{ __('Test connection') }}</button>
        <button type="button" class="btn primary" data-next="3">{{ __('Next: Microsoft 365') }}</button>
      </div>
    </section>

    <section data-panel="3" hidden>
      <div class="callout">
        <strong>{{ __('App registration') }}</strong>
        <div class="steps-help">
          <ol>
            <li>{{ __('In the Microsoft Entra admin center open App registrations → New registration. Choose “Accounts in this organizational directory only”.') }}</li>
            <li>{{ __('Redirect URI (Web):') }} <code>{{ $redirectUri }}</code></li>
            <li>{{ __('Under API permissions add these delegated Microsoft Graph permissions and click “Grant admin consent”:') }}</li>
          </ol>
          <ul class="perm-list">@foreach($permissions as $p)<li>{{ $p }}</li>@endforeach</ul>
          <ol start="4"><li>{{ __('Create a client secret and paste the values below. Nothing here can write to Microsoft 365.') }}</li></ol>
        </div>
      </div>
      <label class="field"><span>{{ __('Directory (tenant) id') }}</span><input class="input mono" name="ms_tenant_id" value="{{ old('ms_tenant_id', $values['ms_tenant_id']) }}" placeholder="00000000-0000-0000-0000-000000000000"></label>
      <label class="field"><span>{{ __('Application (client) id') }}</span><input class="input mono" name="ms_client_id" value="{{ old('ms_client_id', $values['ms_client_id']) }}"></label>
      <label class="field"><span>{{ __('Client secret') }}</span><input class="input mono" name="ms_client_secret" type="password" value="{{ old('ms_client_secret') }}" placeholder="{{ $values['ms_has_secret'] ? '••••••••  ('.__('keep current').')' : '' }}"></label>
      <label class="field"><span>{{ __('Allowed e-mail domains (optional)') }}</span><input class="input" name="ms_allowed_domains" value="{{ old('ms_allowed_domains', $values['ms_allowed_domains']) }}" placeholder="example.com, example.dk"><div class="field-hint">{{ __('Leave empty to allow everyone in your tenant.') }}</div></label>
      <p class="modal-note">{{ __('You can skip this step and add the Microsoft settings later; sign-in stays disabled until then.') }}</p>
      <div class="row">
        <button type="button" class="btn" data-next="2">{{ __('Back') }}</button>
        <span class="grow"></span>
        <button type="submit" class="btn primary" @disabled(!$envWritable)>{{ __('Finish setup') }}</button>
      </div>
    </section>
  </form>
</main>
<script>
  (function () {
    var form = document.getElementById('setup');
    var stepButtons = form.querySelectorAll('.steps button');
    function go(n) {
      form.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== String(n); });
      stepButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.step === String(n)); });
    }
    stepButtons.forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.step); }); });
    form.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.next); }); });
    var driver = document.getElementById('db_connection');
    function toggleDb() { document.getElementById('db-fields').hidden = driver.value === 'sqlite'; }
    driver.addEventListener('change', toggleDb); toggleDb();
    @if($errors->any()) go({{ $errors->has('install') ? 3 : ($errors->hasAny(['db_host','db_database','db_username','db_connection']) ? 2 : 1) }}); @endif
    document.getElementById('test-db').addEventListener('click', function () {
      var out = document.getElementById('db-result');
      out.hidden = false; out.className = 'callout'; out.textContent = '{{ __('Testing…') }}';
      var data = new FormData(form);
      fetch('{{ url('/setup/test-database') }}', { method: 'POST', body: data, headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': data.get('_token') } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.errors) { out.className = 'callout danger'; out.textContent = Object.values(j.errors).map(function (e) { return e.join(' '); }).join(' '); return; }
          out.className = 'callout ' + (j.ok ? 'ok' : 'danger'); out.textContent = j.message;
        })
        .catch(function () { out.className = 'callout danger'; out.textContent = '{{ __('The test request failed.') }}'; });
    });
  })();
</script>
@endsection
