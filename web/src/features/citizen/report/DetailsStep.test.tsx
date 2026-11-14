import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/render';
import ReportFlow from './ReportFlow';
import { DuplicateSheet } from './DuplicateSheet';
import type { NearbyMatch } from '../../../lib/types';

let draft: Record<string, unknown> = {};
vi.mock('../../../lib/drafts', async (orig) => {
  const actual = await orig<typeof import('../../../lib/drafts')>();
  return {
    ...actual,
    loadDraft: async () => ({ ...draft, updatedAt: Date.now() }),
    saveDraft: async () => undefined,
  };
});

beforeEach(() => {
  // A draft with no photo and a location, so the details step opens directly.
  draft = { noPhoto: true, lat: -1.2864, lng: 36.8172 };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 401 })));
});

function renderDetails() {
  return renderWithProviders(
    <Routes>
      <Route path="/report/*" element={<ReportFlow />} />
    </Routes>,
    { route: '/report/details' },
  );
}

describe('Details step', () => {
  it('asks for a description when there is no photo', async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(await screen.findByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/Describe the leak in a few words/)).toBeInTheDocument();
  });

  it('keeps the questions optional and shows step 3 of 3', async () => {
    renderDetails();
    expect(await screen.findByText(/Step 3 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/Every question here is optional/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'What kind of leak is it?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
  });

  it('shows when the report will join an existing one, and lets the citizen undo it', async () => {
    const user = userEvent.setup();
    draft = { ...draft, joinClusterId: 'c1', joinRef: 'FLW-ABC234' };
    renderDetails();
    expect(await screen.findByText(/will be added to FLW-ABC234/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add my report' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No, this is a different leak' }));
    expect(await screen.findByRole('button', { name: 'Send report' })).toBeInTheDocument();
  });

  it('rejects a phone number that is not Kenyan', async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.type(await screen.findByLabelText('Phone number'), '12345');
    await user.type(screen.getByLabelText('Anything else?'), 'Water on the road');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/Enter a Kenyan mobile number/)).toBeInTheDocument();
  });
});

describe('Duplicate sheet', () => {
  const match: NearbyMatch = {
    cluster_id: 'c1', reference_code: 'FLW-ABC234', leak_type: 'burst_pipe', status: 'verified', report_count: 3,
    distance_m: 30, lat: -1.29, lng: 36.79, address_text: 'Ngong Road, Kilimani', area_name: 'Dagoretti North',
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  };

  it('describes the existing report and offers both answers', async () => {
    const user = userEvent.setup();
    const onSame = vi.fn();
    const onDifferent = vi.fn();
    render(<DuplicateSheet match={match} onSame={onSame} onDifferent={onDifferent} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Someone reported a leak 30 m from here' })).toBeInTheDocument();
    expect(screen.getByText('Burst pipe on Ngong Road')).toBeInTheDocument();
    expect(screen.getByText(/Reported 2 hours ago/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Yes, it's the same leak" }));
    expect(onSame).toHaveBeenCalledWith(match);
    await user.click(screen.getByRole('button', { name: 'No, this is a different leak' }));
    expect(onDifferent).toHaveBeenCalled();
  });
});
