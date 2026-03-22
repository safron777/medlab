const { z } = require('zod');

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  name:      z.string().min(1).max(200),
  sex:       z.enum(['male', 'female', 'other']).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  name:      z.string().min(1).max(200),
  sex:       z.enum(['male', 'female', 'other']).nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

module.exports = { registerSchema, loginSchema, profileSchema };
