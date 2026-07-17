import { CalibrationService } from '../../src/modules/calibration/calibration.service';
import { CalibrationRun } from '../../src/modules/calibration/entities/calibration-run.entity';

describe('CalibrationService.applyProposal / revert', () => {
  function makeService(opts: {
    findOneResult?: CalibrationRun | null;
  }) {
    const setThresholdCalls: Array<[string, number]> = [];

    const fakeProfiles = {
      getEnabled: jest.fn().mockResolvedValue([]),
      setThreshold: jest.fn((profileId: string, minDealScore: number) => {
        setThresholdCalls.push([profileId, minDealScore]);
        return Promise.resolve();
      }),
    };

    const fakeListings = {
      scoresForReport: jest.fn().mockResolvedValue([]),
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
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(opts.findOneResult ?? null),
    };

    const service = new CalibrationService(
      fakeListings as unknown as any,
      fakeOutcomes as unknown as any,
      fakeProfiles as unknown as any,
      fakeConfig as unknown as any,
      fakeRepo as unknown as any,
    );

    return { service, fakeProfiles, fakeRepo, setThresholdCalls };
  }

  it('applyProposal applies the proposed threshold and marks the run applied', async () => {
    const { service, fakeProfiles, setThresholdCalls } = makeService({});

    const run = {
      profileId: 'p1',
      applied: false,
      proposal: { proposed: 0.7 },
      inputsSummary: { currentThreshold: 0.6 },
    } as unknown as CalibrationRun;

    const result = await service.applyProposal(run);

    expect(fakeProfiles.setThreshold).toHaveBeenCalledWith('p1', 0.7);
    expect(setThresholdCalls).toEqual([['p1', 0.7]]);
    expect(result.applied).toBe(true);
  });

  it('applyProposal is a no-op when proposal.proposed is null', async () => {
    const { service, fakeProfiles } = makeService({});

    const run = {
      profileId: 'p1',
      applied: false,
      proposal: { proposed: null },
      inputsSummary: { currentThreshold: 0.6 },
    } as unknown as CalibrationRun;

    const result = await service.applyProposal(run);

    expect(fakeProfiles.setThreshold).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
  });

  it('applyProposal is a no-op when the run is already applied', async () => {
    const { service, fakeProfiles } = makeService({});

    const run = {
      profileId: 'p1',
      applied: true,
      proposal: { proposed: 0.7 },
      inputsSummary: { currentThreshold: 0.6 },
    } as unknown as CalibrationRun;

    const result = await service.applyProposal(run);

    expect(fakeProfiles.setThreshold).not.toHaveBeenCalled();
    expect(result.applied).toBe(true);
  });

  it('revert restores the threshold from the last applied run and returns it', async () => {
    const lastApplied = {
      profileId: 'p1',
      applied: true,
      proposal: { proposed: 0.7 },
      inputsSummary: { currentThreshold: 0.6 },
    } as unknown as CalibrationRun;

    const { service, fakeProfiles } = makeService({ findOneResult: lastApplied });

    const result = await service.revert('p1');

    expect(fakeProfiles.setThreshold).toHaveBeenCalledWith('p1', 0.6);
    expect(result).toBe(0.6);
  });

  it('revert returns null when there is no applied run', async () => {
    const { service, fakeProfiles } = makeService({ findOneResult: null });

    const result = await service.revert('p1');

    expect(fakeProfiles.setThreshold).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
