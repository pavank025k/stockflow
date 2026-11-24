import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import './App.css'

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

const money = (value) => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const inputNumber = (value) => value === '' || value == null ? null : Number(value)

function AuthScreen({ onAuthenticated }) {
  const [signup, setSignup] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', organizationName: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } = await api(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body: form })
      onAuthenticated(user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="brand-lockup brand-lockup-large"><span className="brand-mark"><Package size={19} strokeWidth={2.2} /></span><span>stockflow</span></div>
        <div className="auth-brand-copy">
          <p className="eyebrow">INVENTORY, IN FOCUS</p>
          <h1>Know what you have.<br /><span>Move with confidence.</span></h1>
          <p className="auth-subtitle">A calmer way to keep your stock accurate and your business moving.</p>
        </div>
        <div className="brand-footnote"><span className="status-dot" /> Your inventory, organized.</div>
      </section>
      <section className="auth-form-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-brand brand-lockup"><span className="brand-mark"><Package size={18} /></span><span>stockflow</span></div>
          <p className="eyebrow">{signup ? 'GET STARTED' : 'WELCOME BACK'}</p>
          <h2>{signup ? 'Create your workspace' : 'Sign in to StockFlow'}</h2>
          <p className="auth-help">{signup ? 'Set up your organization and start tracking stock.' : 'Your inventory is right where you left it.'}</p>
          {signup && <Field label="Organization name" value={form.organizationName} onChange={(value) => setForm({ ...form, organizationName: value })} placeholder="e.g. Northline Supply" required autoComplete="organization" />}
          <Field label="Email address" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="you@company.com" required autoComplete="email" />
          <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder={signup ? 'At least 8 characters' : 'Enter your password'} required autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} />
          {signup && <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(value) => setForm({ ...form, confirmPassword: value })} placeholder="Re-enter your password" required autoComplete="new-password" />}
          {error && <div className="form-error" role="alert"><AlertTriangle size={16} />{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<ChevronRight size={17} /></button>
          <p className="auth-switch">{signup ? 'Already have an account?' : 'New to StockFlow?'} <button type="button" className="text-button" onClick={() => { setSignup(!signup); setError('') }}>{signup ? 'Sign in' : 'Create an account'}</button></p>
        </form>
      </section>
    </main>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required, min, max, minLength, autoComplete, step }) {
  return <label className="field"><span>{label}</span><input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} min={min} max={max} minLength={minLength} autoComplete={autoComplete} step={step} /></label>
}

function App() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [page, setPage] = useState(window.location.pathname.replace('/', '') || 'dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [products, setProducts] = useState([])
  const [settings, setSettings] = useState(null)
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState(undefined)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api('/api/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch(() => setUser(null)).finally(() => setCheckingSession(false))
    const handlePopState = () => setPage(window.location.pathname.replace('/', '') || 'dashboard')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const loadPage = useEffectEvent(async () => {
    if (!user) return
    try {
      if (page === 'products') {
        const { products: items } = await api('/api/products')
        startTransition(() => setProducts(items))
      } else if (page === 'settings') {
        const { organization } = await api('/api/settings')
        startTransition(() => setSettings(organization))
      } else {
        const [summary, inventory] = await Promise.all([api('/api/dashboard'), api('/api/products')])
        startTransition(() => {
          setDashboard(summary)
          setProducts(inventory.products)
        })
      }
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => { loadPage() }, [user, page])

  function navigate(nextPage) {
    window.history.pushState({}, '', `/${nextPage === 'dashboard' ? '' : nextPage}`)
    setPage(nextPage)
    setNotice('')
  }

  async function refreshDashboard() {
    const [summary, inventory] = await Promise.all([api('/api/dashboard'), api('/api/products')])
    setDashboard(summary)
    setProducts(inventory.products)
  }

  async function saveProduct(productData) {
    const isEditing = editingProduct !== null
    await api(isEditing ? `/api/products/${editingProduct.id}` : '/api/products', {
      method: isEditing ? 'PUT' : 'POST',
      body: productData,
    })
    setEditingProduct(undefined)
    setNotice(isEditing ? 'Product changes saved.' : 'Product added to your inventory.')
    if (page === 'dashboard') await refreshDashboard()
    else {
      const { products: items } = await api('/api/products')
      setProducts(items)
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' })
      setNotice('Product deleted.')
      if (page === 'dashboard') await refreshDashboard()
      else setProducts((current) => current.filter((item) => item.id !== product.id))
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function saveSettings(event) {
    event.preventDefault()
    try {
      const { organization } = await api('/api/settings', { method: 'PUT', body: { defaultLowStockThreshold: Number(settings.defaultLowStockThreshold) } })
      setSettings(organization)
      setNotice('Your setting has been saved.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setDashboard(null)
    setProducts([])
    window.history.pushState({}, '', '/')
    setPage('dashboard')
  }

  if (checkingSession) return <div className="screen-loader"><span className="loader-mark"><Package size={22} /></span></div>
  if (!user) return <AuthScreen onAuthenticated={(authenticatedUser) => { setUser(authenticatedUser); navigate('dashboard') }} />

  const filteredProducts = products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()))
  const pageTitle = page === 'products' ? 'Products' : page === 'settings' ? 'Settings' : 'Dashboard'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark"><Package size={18} strokeWidth={2.2} /></span><span>stockflow</span></div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          <NavItem active={page === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => navigate('dashboard')} />
          <NavItem active={page === 'products'} icon={<Boxes size={18} />} label="Products" onClick={() => navigate('products')} />
          <NavItem active={page === 'settings'} icon={<SettingsIcon size={18} />} label="Settings" onClick={() => navigate('settings')} />
        </nav>
        <div className="sidebar-bottom">
          <div className="org-card"><span className="org-avatar">{user.organizationName?.slice(0, 1).toUpperCase() || 'S'}</span><span className="org-copy"><strong>{user.organizationName}</strong><small>Workspace</small></span></div>
          <button className="logout-button" onClick={logout}><LogOut size={17} /><span>Sign out</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><p className="breadcrumb">STOCKFLOW <span>/</span> {pageTitle.toUpperCase()}</p><h1>{pageTitle}</h1></div>
          <div className="profile-chip"><span className="profile-avatar">{user.email.slice(0, 1).toUpperCase()}</span><span>{user.email}</span></div>
        </header>
        <div className="content-area">
          {notice && <div className="notice" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {page === 'products' && <ProductsPage products={filteredProducts} search={search} setSearch={setSearch} onAdd={() => setEditingProduct(null)} onEdit={(product) => setEditingProduct(product)} onDelete={deleteProduct} />}
          {page === 'dashboard' && <DashboardPage dashboard={dashboard} products={products} onAdd={() => setEditingProduct(null)} onProducts={() => navigate('products')} onEdit={(product) => setEditingProduct(product)} onDelete={deleteProduct} />}
          {page === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} onSubmit={saveSettings} />}
        </div>
      </main>
      {editingProduct !== undefined && <ProductDialog product={editingProduct} onClose={() => setEditingProduct(undefined)} onSave={saveProduct} />}
    </div>
  )
}

function NavItem({ active, icon, label, onClick }) {
  return <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{active && <span className="nav-indicator" />}</button>
}

function DashboardPage({ dashboard, products, onAdd, onProducts, onEdit, onDelete }) {
  const lowStockItems = dashboard?.lowStockItems ?? []
  return <>
    <div className="page-intro"><div><p className="section-kicker">YOUR INVENTORY AT A GLANCE</p><h2>Good to see you.</h2><p className="muted">Here’s the latest from your workspace.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={17} />Add product</button></div>
    <section className="metrics-grid" aria-label="Inventory summary">
      <Metric icon={<Boxes size={19} />} label="Total products" value={dashboard?.totalProducts ?? '—'} footnote="Active in your catalog" tone="green" />
      <Metric icon={<Package size={19} />} label="Units in stock" value={dashboard?.totalStock?.toLocaleString() ?? '—'} footnote="Across all products" tone="blue" />
      <Metric icon={<AlertTriangle size={19} />} label="Low stock" value={dashboard?.lowStockCount ?? '—'} footnote="Needs a closer look" tone="coral" alert={Boolean(dashboard?.lowStockCount)} />
    </section>
    <section className="panel low-stock-panel">
      <div className="panel-heading"><div><div className="panel-title-row"><h3>Low stock items</h3><span className="count-pill">{lowStockItems.length}</span></div><p className="muted">Products at or below their reorder threshold</p></div><button className="quiet-button" onClick={onProducts}>View products <ChevronRight size={15} /></button></div>
      <InventoryTable products={lowStockItems} lowStock onEdit={(product) => onEdit(products.find((item) => item.id === product.id) || product)} onDelete={onDelete} />
    </section>
    <div className="dashboard-foot"><span className="sync-dot" />Inventory data is up to date</div>
  </>
}

function Metric({ icon, label, value, footnote, tone, alert }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-trend">{alert ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span></div><p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-footnote">{footnote}</p></article>
}

function ProductsPage({ products, search, setSearch, onAdd, onEdit, onDelete }) {
  return <>
    <div className="page-intro products-intro"><div><p className="section-kicker">CATALOG</p><h2>Products</h2><p className="muted">Manage the items you keep in stock.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={17} />Add product</button></div>
    <section className="panel products-panel">
      <div className="table-toolbar"><div className="table-count"><strong>All products</strong><span>{products.length}</span></div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" aria-label="Search products by name or SKU" /><kbd>/</kbd></label></div>
      <InventoryTable products={products} onEdit={onEdit} onDelete={onDelete} />
    </section>
  </>
}

function InventoryTable({ products, lowStock = false, onEdit, onDelete }) {
  if (!products.length) return <div className="empty-state"><span className="empty-icon"><Package size={22} /></span><strong>{lowStock ? 'You’re all stocked up' : 'No products yet'}</strong><p>{lowStock ? 'Nothing is currently at or below its low-stock threshold.' : 'Add your first product to start tracking inventory.'}</p></div>
  return <div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Quantity on hand</th>{lowStock && <th>Threshold</th>}{!lowStock && <th>Low stock</th>}<th>{lowStock ? 'Status' : 'Selling price'}</th>{!lowStock && <th className="actions-heading">Actions</th>}</tr></thead><tbody>
    {products.map((product) => <tr key={product.id}>
      <td><div className="product-name-cell"><span className="product-mini-icon"><Package size={16} /></span><span><strong>{product.name}</strong>{product.description && <small>{product.description}</small>}</span></div></td>
      <td><span className="sku">{product.sku}</span></td>
      <td><strong className="quantity-value">{product.quantityOnHand}</strong><span className="unit-label"> units</span></td>
      {lowStock && <td>{product.lowStockThreshold}</td>}
      {!lowStock && <td>{product.isLowStock ? <span className="stock-badge"><span />Low stock</span> : <span className="in-stock-badge">In stock</span>}</td>}
      <td>{lowStock ? <span className="stock-badge"><span />Low stock</span> : <span className="price-value">{money(product.sellingPrice)}</span>}</td>
      {!lowStock && <td><div className="row-actions"><button className="icon-button" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} title="Edit product"><SettingsIcon size={16} /></button><button className="icon-button danger-hover" onClick={() => onDelete(product)} aria-label={`Delete ${product.name}`} title="Delete product"><X size={17} /></button></div></td>}
    </tr>)}
  </tbody></table></div>
}

function SettingsPage({ settings, setSettings, onSubmit }) {
  return <>
    <div className="page-intro"><div><p className="section-kicker">WORKSPACE PREFERENCES</p><h2>Settings</h2><p className="muted">Set how StockFlow flags inventory that needs attention.</p></div></div>
    <form className="panel settings-panel" onSubmit={onSubmit}>
      <div className="settings-heading"><span className="settings-icon"><CircleDollarSign size={19} /></span><div><h3>Low-stock threshold</h3><p className="muted">Used for products without their own threshold.</p></div></div>
      <label className="field threshold-field"><span>Default low-stock threshold</span><div className="number-input-wrap"><input type="number" min="0" max="1000000" step="1" required value={settings?.defaultLowStockThreshold ?? ''} onChange={(event) => setSettings({ ...settings, defaultLowStockThreshold: event.target.value })} /><span>units</span></div><small>When a product’s quantity reaches this number, it appears in the low-stock list. Individual product thresholds take precedence.</small></label>
      <div className="settings-footer"><span className="muted">Changes apply to your organization.</span><button className="button button-primary" type="submit" disabled={!settings}><Check size={16} />Save changes</button></div>
    </form>
  </>
}

function ProductDialog({ product, onClose, onSave }) {
  const [form, setForm] = useState(product ? {
    name: product.name,
    sku: product.sku,
    description: product.description || '',
    quantityOnHand: String(product.quantityOnHand),
    costPrice: product.costPrice == null ? '' : String(product.costPrice),
    sellingPrice: product.sellingPrice == null ? '' : String(product.sellingPrice),
    lowStockThreshold: product.lowStockThreshold == null ? '' : String(product.lowStockThreshold),
  } : { name: '', sku: '', description: '', quantityOnHand: '0', costPrice: '', sellingPrice: '', lowStockThreshold: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isEditing = product !== null

  async function submit(event) {
    event.preventDefault()
    setError('')
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      description: form.description.trim() || null,
      quantityOnHand: Number(form.quantityOnHand),
      costPrice: inputNumber(form.costPrice),
      sellingPrice: inputNumber(form.sellingPrice),
      lowStockThreshold: inputNumber(form.lowStockThreshold),
    }
    if (!Number.isInteger(payload.quantityOnHand) || payload.quantityOnHand < 0) return setError('Quantity must be a non-negative whole number.')
    if ([payload.costPrice, payload.sellingPrice].some((price) => price !== null && (!Number.isFinite(price) || price < 0))) return setError('Prices must be zero or greater.')
    if (payload.lowStockThreshold !== null && (!Number.isInteger(payload.lowStockThreshold) || payload.lowStockThreshold < 0)) return setError('Threshold must be a non-negative whole number.')
    setBusy(true)
    try {
      await onSave(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
      <div className="dialog-heading"><div><p className="section-kicker">PRODUCT DETAILS</p><h2 id="product-dialog-title">{isEditing ? 'Edit product' : 'Add a product'}</h2></div><button className="icon-button close-dialog" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <form onSubmit={submit}>
        <div className="form-grid"><Field label="Product name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Ceramic travel mug" required /><Field label="SKU" value={form.sku} onChange={(value) => setForm({ ...form, sku: value })} placeholder="e.g. MUG-042" required />
          <label className="field field-wide"><span>Description <small>Optional</small></span><textarea rows="2" maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short description" /></label>
          <Field label="Quantity on hand" type="number" value={form.quantityOnHand} onChange={(value) => setForm({ ...form, quantityOnHand: value })} min="0" step="1" required />
          <Field label="Low-stock threshold" type="number" value={form.lowStockThreshold} onChange={(value) => setForm({ ...form, lowStockThreshold: value })} placeholder="Use organization default" min="0" step="1" />
          <Field label="Cost price" type="number" value={form.costPrice} onChange={(value) => setForm({ ...form, costPrice: value })} placeholder="Optional" min="0" step="0.01" />
          <Field label="Selling price" type="number" value={form.sellingPrice} onChange={(value) => setForm({ ...form, sellingPrice: value })} placeholder="Optional" min="0" step="0.01" />
        </div>
        {error && <div className="form-error dialog-error" role="alert"><AlertTriangle size={16} />{error}</div>}
        <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : isEditing ? 'Save changes' : 'Add product'}</button></div>
      </form>
    </section>
  </div>
}

export default App