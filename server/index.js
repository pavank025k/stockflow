import 'dotenv/config'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { parseCookie, stringifySetCookie } from 'cookie'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const databaseUrl = process.env.DATABASE_URL || 'file:./stockflow.db'
export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const app = express()
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me')
const cookieName = 'stockflow_session'
const defaultThreshold = 5

if (!jwtSecret) throw new Error('JWT_SECRET is required in production')

app.use(express.json({ limit: '100kb' }))

const emailSchema = z.string().trim().email().max(254)
const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  organizationName: z.string().trim().min(1).max(100),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
})
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) })
const productFields = {
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(80),
  description: z.string().max(1000).nullable().optional(),
  quantityOnHand: z.number().int().min(0).default(0),
  costPrice: z.number().finite().min(0).nullable().optional(),
  sellingPrice: z.number().finite().min(0).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
}
const createProductSchema = z.object(productFields)
const updateProductSchema = createProductSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required')
const settingsSchema = z.object({ defaultLowStockThreshold: z.number().int().min(0) })

function sendValidationError(res, error) {
  return res.status(400).json({ error: error.issues?.[0]?.message || 'Invalid request data' })
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', stringifySetCookie({ name: cookieName, value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }))
}

async function requireAuth(req, res, next) {
  try {
    const token = parseCookie(req.headers.cookie || '')[cookieName]
    if (!token) return res.status(401).json({ error: 'Please log in to continue' })
    const payload = jwt.verify(token, jwtSecret)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, organizationId: true, organization: { select: { name: true } } },
    })
    if (!user) return res.status(401).json({ error: 'Session is no longer valid' })
    req.user = user
    return next()
  } catch {
    return res.status(401).json({ error: 'Please log in to continue' })
  }
}

function issueToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' })
}

app.post('/api/auth/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return sendValidationError(res, parsed.error)
  const { email, password, organizationName } = parsed.data
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: organizationName, defaultLowStockThreshold: defaultThreshold } })
      return tx.user.create({ data: { email: email.toLowerCase(), passwordHash, organizationId: organization.id }, include: { organization: true } })
    })
    setSessionCookie(res, issueToken(user))
    return res.status(201).json({ user: { id: user.id, email: user.email, organizationName: user.organization.name } })
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists' })
    console.error(error)
    return res.status(500).json({ error: 'Could not create account' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return sendValidationError(res, parsed.error)
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { organization: true } })
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' })
  }
  setSessionCookie(res, issueToken(user))
  return res.json({ user: { id: user.id, email: user.email, organizationName: user.organization.name } })
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', stringifySetCookie({ name: cookieName, value: '', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 }))
  return res.json({ success: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, organizationName: req.user.organization.name } })
})

app.get('/api/products', requireAuth, async (req, res) => {
  const [products, organization] = await Promise.all([
    prisma.product.findMany({ where: { organizationId: req.user.organizationId }, orderBy: { updatedAt: 'desc' } }),
    prisma.organization.findUnique({ where: { id: req.user.organizationId }, select: { defaultLowStockThreshold: true } }),
  ])
  res.json({ products: products.map((product) => {
    const effectiveThreshold = product.lowStockThreshold ?? organization?.defaultLowStockThreshold ?? defaultThreshold
    return { ...product, effectiveLowStockThreshold: effectiveThreshold, isLowStock: product.quantityOnHand <= effectiveThreshold }
  }) })
})

app.post('/api/products', requireAuth, async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body)
  if (!parsed.success) return sendValidationError(res, parsed.error)
  try {
    const product = await prisma.product.create({ data: { ...parsed.data, organizationId: req.user.organizationId } })
    return res.status(201).json({ product })
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'A product with this SKU already exists' })
    console.error(error)
    return res.status(500).json({ error: 'Could not create product' })
  }
})

app.get('/api/products/:id', requireAuth, async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } })
  if (!product) return res.status(404).json({ error: 'Product not found' })
  return res.json({ product })
})

app.put('/api/products/:id', requireAuth, async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body)
  if (!parsed.success) return sendValidationError(res, parsed.error)
  try {
    const result = await prisma.product.updateMany({
      where: { id: req.params.id, organizationId: req.user.organizationId },
      data: parsed.data,
    })
    if (!result.count) return res.status(404).json({ error: 'Product not found' })
    const product = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } })
    return res.json({ product })
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'A product with this SKU already exists' })
    console.error(error)
    return res.status(500).json({ error: 'Could not update product' })
  }
})

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const result = await prisma.product.deleteMany({ where: { id: req.params.id, organizationId: req.user.organizationId } })
  if (!result.count) return res.status(404).json({ error: 'Product not found' })
  return res.json({ success: true })
})

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const [products, aggregate] = await Promise.all([
    prisma.product.findMany({ where: { organizationId: req.user.organizationId }, orderBy: { name: 'asc' } }),
    prisma.product.aggregate({ where: { organizationId: req.user.organizationId }, _sum: { quantityOnHand: true } }),
  ])
  const organization = await prisma.organization.findUnique({ where: { id: req.user.organizationId }, select: { defaultLowStockThreshold: true } })
  const lowStockItems = products.filter((product) => product.quantityOnHand <= (product.lowStockThreshold ?? organization?.defaultLowStockThreshold ?? defaultThreshold))
  return res.json({
    totalProducts: products.length,
    totalStock: aggregate._sum.quantityOnHand || 0,
    lowStockCount: lowStockItems.length,
    lowStockItems: lowStockItems.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      quantityOnHand: product.quantityOnHand,
      lowStockThreshold: product.lowStockThreshold ?? organization?.defaultLowStockThreshold ?? defaultThreshold,
    })),
  })
})

app.get('/api/settings', requireAuth, async (req, res) => {
  const organization = await prisma.organization.findUnique({ where: { id: req.user.organizationId }, select: { name: true, defaultLowStockThreshold: true } })
  return res.json({ organization })
})

app.put('/api/settings', requireAuth, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) return sendValidationError(res, parsed.error)
  const organization = await prisma.organization.update({ where: { id: req.user.organizationId }, data: parsed.data, select: { name: true, defaultLowStockThreshold: true } })
  return res.json({ organization })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }))

if (process.env.NODE_ENV === 'production') {
  const root = path.dirname(fileURLToPath(import.meta.url))
  app.use(express.static(path.resolve(root, '../dist')))
  app.get(/.*/, (_req, res) => res.sendFile(path.resolve(root, '../dist/index.html')))
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Unexpected server error' })
})

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`StockFlow API listening on port ${port}`))
}

export default app