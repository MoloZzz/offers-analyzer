import { CalibrationService } from '../../src/modules/calibration/calibration.service';
import { CalibrationRun } from '../../src/modules/calibration/entities/calibration-run.entity';

describe('CalibrationService.proposeAllProfiles', () => {
  it('proposes a threshold per enabled profile using per-profile scores and global precision', async () => {
    const profiles = [
      { id: 'p1', minDealScore: 0.6 },
      { id: 'p2', minDealScore: 0.2 },
    ];

    const fakeProfiles = {
      getEnabled: jest.fn().mockResolvedValue(profiles),
    };

    const fakeListings = {
      scoresForReport: jest.fn().mockImplementation((profileId?: string) => {
        if (profileId === 'p1') {
          return Promise.resolve(Array.from({ length: 30 }, (_, i) => 0.5 + i * 0.02)); // many >= 0.6
        }
        if (profileId === 'p2') {
          return Promise.resolve(Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.02)); // many >= 0.2
        }
        return Promise.resolve([]);
      }),
    };

    const fakeOutcomes = {
      manualLabeledSince: jest.fn().mockResolvedValue([]),
    };

    const fakeConfig = {
      get: jest.fn().mockReturnValue(0.63),
    };

    const fakeRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
    };

    const service = new CalibrationService(
      fakeListings as unknown as any,
      fakeOutcomes as unknown as any,
      fakeProfiles as unknown as any,
      fakeConfig as unknown as any,
      fakeRepo as unknown as any,
    );

    const runs = await service.proposeAllProfiles({ maxVolume: 5 });

    expect(runs).toHaveLength(2);

    const byProfile = new Map(runs.map((r) => [r.profileId, r]));

    const run1 = byProfile.get('p1') as CalibrationRun;
    expect(run1).toBeDefined();
    expect(run1.mode).toBe('propose');
    expect(run1.applied).toBe(false);
    expect(run1.inputsSummary.currentThreshold).toBe(0.6);

    const run2 = byProfile.get('p2') as CalibrationRun;
    expect(run2).toBeDefined();
    expect(run2.mode).toBe('propose');
    expect(run2.applied).toBe(false);
    expect(run2.inputsSummary.currentThreshold).toBe(0.2);

    expect(fakeListings.scoresForReport).toHaveBeenCalledWith('p1');
    expect(fakeListings.scoresForReport).toHaveBeenCalledWith('p2');
  });
});
