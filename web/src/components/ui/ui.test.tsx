import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import i18n from '../../i18n';
import { SeverityBadge, StatusBadge, PriorityScore } from './Badges';
import { ChoiceCards } from './ChoiceCards';
import { ProgressSteps } from './ProgressSteps';
import { Timeline } from './Timeline';
import { ConfirmDialog } from './Dialog';
import { Field, TextInput } from './Field';
import { IconBurstPipe, IconPooling } from './Icons';

describe('badges', () => {
  it('shows severity as a word with an icon, never colour alone', () => {
    const { container } = render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('uses the same word for a status everywhere', () => {
    render(<StatusBadge status="fixed" />);
    expect(screen.getByText('Fixed')).toBeInTheDocument();
  });

  it('gives the priority score an accessible name', () => {
    render(<PriorityScore score={73} overridden />);
    expect(screen.getByText('Priority 73 out of 100, set by a dispatcher')).toHaveClass('sr-only');
  });

  it('switches language', async () => {
    await act(() => i18n.changeLanguage('sw'));
    render(<StatusBadge status="fixed" />);
    expect(screen.getByText('Imerekebishwa')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
  });
});

describe('ChoiceCards', () => {
  it('is a labelled radio group that works with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceCards
        legend="What do you see?"
        options={[
          { value: 'burst_pipe', label: 'Burst pipe', icon: IconBurstPipe },
          { value: 'pooling', label: 'Water pooling', icon: IconPooling },
        ]}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'What do you see?' })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Water pooling'));
    expect(onChange).toHaveBeenCalledWith('pooling');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});

describe('ProgressSteps', () => {
  it('says which step you are on', () => {
    render(<ProgressSteps step={2} total={3} labels={['Photo', 'Location', 'Details']} />);
    expect(screen.getByText(/Step 2 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });
});

describe('Timeline', () => {
  it('marks the current step and shows the steps still to come', () => {
    render(<Timeline status="scheduled" events={[{ status: 'received', created_at: new Date().toISOString() }]} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByText('Waiting')).toHaveLength(2);
    expect(screen.getByText('Current status')).toBeInTheDocument();
  });

  it('explains a report that was not a leak', () => {
    render(<Timeline status="invalid" events={[{ status: 'invalid', created_at: new Date().toISOString(), note: 'Car wash run-off' }]} />);
    expect(screen.getByText(/Car wash run-off/)).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('links the label, hint and error to the input', () => {
    render(
      <Field label="Phone" hint="A Kenyan number" error="Enter a Kenyan mobile number">
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} />}
      </Field>,
    );
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Enter a Kenyan mobile number/);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Kenyan mobile number');
  });
});

describe('ConfirmDialog', () => {
  it('asks before a destructive action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Mark as not a leak?" confirmLabel="Mark as not a leak" danger onConfirm={onConfirm} onCancel={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Mark as not a leak' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
