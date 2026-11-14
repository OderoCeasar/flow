import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/render';
import ReportFlow from './ReportFlow';

vi.mock('../../../lib/drafts', async (orig) => {
  const actual = await orig<typeof import('../../../lib/drafts')>();
  return {
    ...actual,
    // A draft with no photo and a location, so the details step opens directly.
    loadDraft: async () => ({ noPhoto: true, lat: -1.2864, lng: 36.8172, updatedAt: Date.now() }),
    saveDraft: async () => undefined,
  };
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/reports/nearby')) {
      return new Response(
        JSON.stringify({
          covered: true,
          matches: [{ cluster_id: 'c1', reference_code: 'FLW-ABC234', leak_type: 'burst_pipe', status: 'received', report_count: 2, distance_m: 18, created_at: new Date().toISOString() }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ user: null }), { status: 401 });
  });
  vi.stubGlobal('fetch', fetchMock);
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

  it('keeps the other questions optional and shows step 3 of 3', async () => {
    renderDetails();
    expect(await screen.findByText(/Step 3 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /What do you see\?/ })).toHaveTextContent('optional');
  });

  it('warns about a likely duplicate and lets the citizen join it', async () => {
    const user = userEvent.setup();
    renderDetails();
    expect(await screen.findByText('Others have reported a leak near here')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add my report to it' }));
    await waitFor(() => expect(screen.getByText(/will be added to FLW-ABC234/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add my report' })).toBeInTheDocument();
  });

  it('rejects a phone number that is not Kenyan', async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.type(await screen.findByLabelText(/Phone number for SMS updates/), '12345');
    await user.type(screen.getByLabelText(/Anything else/), 'Water on the road');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/Enter a Kenyan mobile number/)).toBeInTheDocument();
  });
});
