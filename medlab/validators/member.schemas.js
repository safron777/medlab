const { z } = require('zod');

const memberSchema = z.object({
  name:      z.string().min(1).max(200),
  sex:       z.enum(['male', 'female', 'other']).nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  relation:  z.string().max(100).optional(),
});

module.exports = { memberSchema };
