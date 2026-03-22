const { z } = require('zod');

const parameterSchema = z.object({
  name:       z.string().min(1).max(200),
  value:      z.union([z.number(), z.string()]).optional(),
  unit:       z.string().max(50).optional(),
  refLow:     z.union([z.number(), z.string()]).optional(),
  refHigh:    z.union([z.number(), z.string()]).optional(),
  ref_min:    z.union([z.number(), z.string()]).optional(),
  ref_max:    z.union([z.number(), z.string()]).optional(),
  refMin:     z.union([z.number(), z.string()]).optional(),
  refMax:     z.union([z.number(), z.string()]).optional(),
  refText:    z.string().max(500).optional(),
  isAbnormal: z.boolean().optional(),
});

const testBodySchema = z.object({
  name:       z.string().min(1).max(500).optional().default(''),
  date:       z.string().min(1),
  lab:        z.string().max(200).optional(),
  labName:    z.string().max(200).optional(),
  doctor:     z.string().max(200).optional(),
  category:   z.enum(['blood', 'urine', 'biochem', 'hormones', 'vitamins', 'other']).default('other'),
  conclusion: z.string().max(5000).optional(),
  notes:      z.string().max(5000).optional(),
  nextVisit:  z.string().optional(),
  memberId:   z.string().optional(),
  parameters: z.array(parameterSchema).max(300).optional().default([]),
  attachments: z.array(z.object({
    name:     z.string().max(255),
    type:     z.string().max(100),
    size:     z.number().max(10 * 1024 * 1024),
    data:     z.string(),
  })).max(10).optional().default([]),
});

module.exports = { testBodySchema };
