import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from './StudentDashboard';

const mockNavigate = vi.fn();
const mockToggleFavorite = vi.fn();
const mockToggleCompleted = vi.fn();
const mockRefreshAttempts = vi.fn();
const mockLogout = vi.fn();
const emptySet = new Set();

const sampleQuiz = {
  _id: 'quiz-1',
  module: 'Biology',
  title: 'What is Biology',
  difficulty: 'easy',
  timeLimitMinutes: 10,
  questions: [
    {
      question: 'What defines biology?',
      options: ['Study of life', 'Study of rocks', 'Study of stars', 'Study of maps'],
      correctIndex: 0,
      explanation: 'Biology is the scientific study of life.'
    }
  ]
};

const sampleVideos = [
  {
    _id: 'video-1',
    title: 'Introduction to Biology',
    description: 'Lesson 1',
    module: 'Biology',
    uploadedAt: '2026-03-17T10:00:00.000Z'
  }
];

const mockCourseData = {
  videos: sampleVideos,
  course: 'Science',
  favoriteIds: emptySet,
  completedIds: emptySet,
  quizzes: [sampleQuiz],
  quizAttempts: [],
  isLoading: false,
  loadError: null,
  toggleFavorite: mockToggleFavorite,
  toggleCompleted: mockToggleCompleted,
  refreshAttempts: mockRefreshAttempts,
  favMutError: null,
  progressMutError: null
};

const fieldRegistration = { name: 'field', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('../hooks/useCourseData', () => ({
  useCourseData: () => mockCourseData
}));

vi.mock('../hooks/useFeedback', () => ({
  useFeedback: () => ({
    register: () => fieldRegistration,
    handleFeedbackSubmit: (callback) => (event) => {
      event.preventDefault();
      return callback?.({});
    },
    isSubmittingFeedback: false,
    feedbackInlineError: '',
    feedbackToast: null,
    isFeedbackToastDismissing: false,
    dismissFeedbackToast: vi.fn()
  })
}));

vi.mock('../stores/sessionStore', () => ({
  useSessionStore: () => ({
    session: { username: 'student1' },
    logout: mockLogout
  })
}));

vi.mock('../components/VideoCard', () => ({
  default: ({ video }) => <article data-testid="video-card">{video.title}</article>
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <StudentDashboard />
    </MemoryRouter>
  );
}

async function openQuiz() {
  const user = userEvent.setup();
  renderDashboard();

  await user.click(screen.getByRole('button', { name: /biology/i }));
  await user.click(screen.getByRole('button', { name: /what is biology/i }));

  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  return { user };
}

describe('StudentDashboard quiz flow', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('opens the quiz modal when a quiz card is selected', async () => {
    await openQuiz();

    expect(screen.getByText(/what defines biology\?/i)).toBeInTheDocument();
    expect(screen.getByText(/time left: 10:00/i)).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });

  it('shows exit confirmation and keeps the quiz session active when continuing', async () => {
    const { user } = await openQuiz();

    await user.click(screen.getByRole('button', { name: /exit quiz/i }));

    expect(screen.getByText(/exit quiz\?/i)).toBeInTheDocument();
    expect(screen.getByText(/your marked answers will not be saved/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue quiz/i }));

    await waitFor(() => {
      expect(screen.queryByText(/exit quiz\?/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/what defines biology\?/i)).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });
});