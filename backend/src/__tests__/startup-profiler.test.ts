import { StartupProfiler } from '../utils/startup-profiler';

describe('StartupProfiler', () => {
  describe('mark() and end()', () => {
    test('should record the correct duration for a marked phase', async () => {
      const profiler = new StartupProfiler();

      profiler.mark('test_phase');
      await new Promise((resolve) => setTimeout(resolve, 40));
      profiler.end('test_phase');

      const report = profiler.report();
      expect(report).toHaveLength(1);
      expect(report[0].phase).toBe('test_phase');
      expect(report[0].ms).toBeGreaterThanOrEqual(30);
    });

    test('should handle multiple phases', async () => {
      const profiler = new StartupProfiler();

      profiler.mark('phase_1');
      await new Promise((resolve) => setTimeout(resolve, 20));
      profiler.end('phase_1');

      profiler.mark('phase_2');
      await new Promise((resolve) => setTimeout(resolve, 20));
      profiler.end('phase_2');

      const report = profiler.report();
      expect(report).toHaveLength(2);
      expect(report[0].phase).toBe('phase_1');
      expect(report[1].phase).toBe('phase_2');
    });
  });

  describe('report()', () => {
    test('should return array of phase records', () => {
      const profiler = new StartupProfiler();

      profiler.mark('test_1');
      profiler.end('test_1');

      const report = profiler.report();
      expect(Array.isArray(report)).toBe(true);
      expect(report[0]).toHaveProperty('phase');
      expect(report[0]).toHaveProperty('ms');
      expect(typeof report[0].ms).toBe('number');
    });
  });

  describe('totalTime()', () => {
    test('should return total elapsed time', async () => {
      const profiler = new StartupProfiler();

      await new Promise((resolve) => setTimeout(resolve, 20));
      const totalTime = profiler.totalTime();

      expect(totalTime).toBeGreaterThanOrEqual(10);
    });

    test('should increase with time', async () => {
      const profiler = new StartupProfiler();

      const time1 = profiler.totalTime();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const time2 = profiler.totalTime();

      expect(time2).toBeGreaterThan(time1);
    });
  });
});
