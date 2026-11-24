import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'

process.env.DATABASE_URL = 'file:./stockflow-test.db'
process.env.JWT_SECRET = 'test-secret-with-enough-randomness'

let app
let prisma
let server
let baseUrl

before(async () => {
  const migration = spawnSync('npx prisma db push --force-reset', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    encoding: 'utf8',
    shell: true,
  })
  assert.equal(migration.status, 0, migration.stderr || migration.stdout)
  const apiModule = await import('../server/index.js')
  app = apiModule.default
  prisma = apiModule.prisma
  await prisma.$connect()
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server?.close(resolve))
  await prisma?.$disconnect()
})

async function call(path, { method = 'GET', body, session } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  const setCookie = response.headers.getSetCookie?.()[0]
  return { response, data, session: setCookie?.split(';')[0] || session }
}

test('auth, inventory calculations, validation, and organization isolation', async () => {
  assert.equal((await call('/api/products')).response.status, 401)

  const mismatchedSignup = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: 'bad@example.test', password: 'password123', confirmPassword: 'different', organizationName: 'Wrong' },
  })
  assert.equal(mismatchedSignup.response.status, 400)

  const signupA = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: 'owner-a@example.test', password: 'password123', confirmPassword: 'password123', organizationName: 'Northline' },
  })
  assert.equal(signupA.response.status, 201, JSON.stringify(signupA.data))
  const sessionA = signupA.session
  const meA = await call('/api/auth/me', { session: sessionA })
  assert.equal(meA.response.status, 200, JSON.stringify({ sessionA, body: meA.data }))
  assert.equal(meA.data.user.organizationName, 'Northline')

  assert.equal((await call('/api/auth/signup', {
    method: 'POST',
    body: { email: 'owner-a@example.test', password: 'password123', confirmPassword: 'password123', organizationName: 'Duplicate' },
  })).response.status, 409)
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'owner-a@example.test', password: 'incorrect' } })).response.status, 401)

  const productA = await call('/api/products', {
    method: 'POST', session: sessionA,
    body: { name: 'Charger', sku: 'CHG-1', quantityOnHand: 2, lowStockThreshold: 1, costPrice: null, sellingPrice: 18.5 },
  })
  assert.equal(productA.response.status, 201)
  const itemA = productA.data.product
  const defaultItem = await call('/api/products', {
    method: 'POST', session: sessionA,
    body: { name: 'Headphones', sku: 'HP-1', quantityOnHand: 5 },
  })
  assert.equal(defaultItem.response.status, 201)

  assert.equal((await call('/api/products', {
    method: 'POST', session: sessionA,
    body: { name: 'Duplicate SKU', sku: 'CHG-1', quantityOnHand: 1 },
  })).response.status, 409)
  assert.equal((await call('/api/products', {
    method: 'POST', session: sessionA,
    body: { name: 'Invalid quantity', sku: 'BAD-QTY', quantityOnHand: -1 },
  })).response.status, 400)
  assert.equal((await call('/api/products', {
    method: 'POST', session: sessionA,
    body: { name: 'Invalid price', sku: 'BAD-PRICE', quantityOnHand: 1, sellingPrice: -1 },
  })).response.status, 400)

  const initialDashboard = await call('/api/dashboard', { session: sessionA })
  assert.deepEqual({
    totalProducts: initialDashboard.data.totalProducts,
    totalStock: initialDashboard.data.totalStock,
    lowStockCount: initialDashboard.data.lowStockCount,
  }, { totalProducts: 2, totalStock: 7, lowStockCount: 1 })
  assert.equal(initialDashboard.data.lowStockItems[0].name, 'Headphones')

  const updatedThreshold = await call('/api/settings', { method: 'PUT', session: sessionA, body: { defaultLowStockThreshold: 6 } })
  assert.equal(updatedThreshold.data.organization.defaultLowStockThreshold, 6)
  const updatedDashboard = await call('/api/dashboard', { session: sessionA })
  assert.equal(updatedDashboard.data.lowStockCount, 1)
  const productListA = await call('/api/products', { session: sessionA })
  const enrichedProduct = productListA.data.products.find((product) => product.id === itemA.id)
  assert.equal(enrichedProduct.isLowStock, false)
  assert.equal(enrichedProduct.effectiveLowStockThreshold, 1)

  const signupB = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: 'owner-b@example.test', password: 'password123', confirmPassword: 'password123', organizationName: 'Southbank' },
  })
  assert.equal(signupB.response.status, 201)
  const sessionB = signupB.session
  assert.equal((await call('/api/products', { session: sessionB })).data.products.length, 0)
  assert.equal((await call('/api/dashboard', { session: sessionB })).data.totalProducts, 0)

  const productB = await call('/api/products', {
    method: 'POST', session: sessionB,
    body: { name: 'Laptop', sku: 'LAP-1', quantityOnHand: 11 },
  })
  assert.equal(productB.response.status, 201)
  assert.equal((await call(`/api/products/${itemA.id}`, { session: sessionB })).response.status, 404)
  assert.equal((await call(`/api/products/${itemA.id}`, { method: 'PUT', session: sessionB, body: { quantityOnHand: 0 } })).response.status, 404)
  assert.equal((await call(`/api/products/${itemA.id}`, { method: 'DELETE', session: sessionB })).response.status, 404)
  assert.equal((await call('/api/settings', { session: sessionB })).data.organization.defaultLowStockThreshold, 5)

  assert.equal((await call('/api/auth/logout', { method: 'POST', session: sessionA })).response.status, 200)
  assert.equal((await call('/api/auth/me')).response.status, 401)
  assert.equal((await call(`/api/products/${itemA.id}`, { method: 'PUT', session: sessionA, body: { quantityOnHand: 4 } })).response.status, 200)
  assert.equal((await call(`/api/products/${itemA.id}`, { method: 'DELETE', session: sessionA })).response.status, 200)
})