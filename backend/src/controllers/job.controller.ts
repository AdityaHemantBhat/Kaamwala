import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

/** Fields a worker may set on their own job posting — never spread req.body. */
const JOB_FIELDS = [
  'title', 'description', 'category', 'price', 'priceUnit',
  'city', 'pincode', 'estimatedHours', 'skills',
] as const;

const VALID_JOB_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED'];

function pickJobFields(body: Record<string, unknown>): Record<string, any> {
  const out: Record<string, unknown> = {};
  for (const key of JOB_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export const jobController = {
  createJob: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found. Complete your profile first.');
      }

      const data: any = pickJobFields(req.body);
      data.workerProfileId = workerProfile.id;
      if (!Array.isArray(data.skills)) data.skills = [];

      const job = await prisma.workerJob.create({ data });

      sendResponse(res, 201, job, 'Job posted successfully');
    } catch (e: any) {
      sendError(res, 500, e.message || 'Failed to create job posting');
    }
  },

  listJobs: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found');
      }

      const { status, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      const where: any = { workerProfileId: workerProfile.id };
      if (status) where.status = status;

      const [jobs, total] = await Promise.all([
        prisma.workerJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.workerJob.count({ where }),
      ]);

      sendResponse(res, 200, {
        jobs,
        total,
        page: parseInt(page as string),
        limit: take,
        totalPages: Math.ceil(total / take),
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getJob: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found');
      }

      const job = await prisma.workerJob.findFirst({
        where: {
          id: req.params.id,
          workerProfileId: workerProfile.id,
        },
      });

      if (!job) {
        return sendError(res, 404, 'Job posting not found');
      }

      sendResponse(res, 200, job);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  updateJob: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found');
      }

      const existing = await prisma.workerJob.findFirst({
        where: {
          id: req.params.id,
          workerProfileId: workerProfile.id,
        },
      });

      if (!existing) {
        return sendError(res, 404, 'Job posting not found or not yours');
      }

      const job = await prisma.workerJob.update({
        where: { id: req.params.id },
        data: pickJobFields(req.body),
      });

      sendResponse(res, 200, job, 'Job updated successfully');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  deleteJob: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found');
      }

      const existing = await prisma.workerJob.findFirst({
        where: {
          id: req.params.id,
          workerProfileId: workerProfile.id,
        },
      });

      if (!existing) {
        return sendError(res, 404, 'Job posting not found or not yours');
      }

      await prisma.workerJob.delete({ where: { id: req.params.id } });

      sendResponse(res, 200, null, 'Job posting deleted');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  updateJobStatus: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!workerProfile) {
        return sendError(res, 404, 'Worker profile not found');
      }

      const existing = await prisma.workerJob.findFirst({
        where: {
          id: req.params.id,
          workerProfileId: workerProfile.id,
        },
      });

      if (!existing) {
        return sendError(res, 404, 'Job posting not found or not yours');
      }

      const { status } = req.body;
      if (!VALID_JOB_STATUSES.includes(status)) {
        return sendError(res, 400, 'Invalid job status');
      }

      const job = await prisma.workerJob.update({
        where: { id: req.params.id },
        data: { status },
      });

      sendResponse(res, 200, job, `Job status updated to ${status}`);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
