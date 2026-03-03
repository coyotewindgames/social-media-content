# Planning Guide

A comprehensive social media content planner with OAuth integration for Instagram, TikTok, Facebook, Twitter, and YouTube. Features AI-assisted caption generation, content scheduling, account management, and automated posting capabilities.

**Experience Qualities**: 
1. **Professional** - Enterprise-grade OAuth integration with secure account management across multiple platforms
2. **Organized** - Clear visual structure for managing content across different social media accounts and schedules
3. **Automated** - Streamlined workflow from content creation to multi-platform publishing

**Complexity Level**: Complex Application (advanced functionality with multiple integrations)
This is a full-featured social media automation platform with OAuth authentication, multi-account management, API integrations with 5 major platforms, and automated content publishing capabilities.

## Essential Features

### AI Caption Generator
- **Functionality**: Generate creative captions based on content description and tone
- **Purpose**: Helps creators overcome writer's block and explore different caption styles
- **Trigger**: User enters content description and selects desired tone/style
- **Progression**: Enter description → Select tone (casual/professional/playful/inspirational) → Generate → View suggestions → Copy or edit
- **Success criteria**: Generates 3 varied caption options that match the selected tone

### Content Calendar View
- **Functionality**: Visual calendar showing planned content ideas
- **Purpose**: Helps creators see their content strategy at a glance and maintain consistency
- **Trigger**: User navigates to calendar view
- **Progression**: View monthly calendar → See content cards on dates → Click to view/edit details → Add new content to dates
- **Success criteria**: Calendar displays all planned content with clear visual indicators of content type

### Content Idea Cards
- **Functionality**: Individual cards storing content details (description, caption, platform, notes)
- **Purpose**: Organizes all details about a content idea in one place
- **Trigger**: User creates new content idea or clicks existing card
- **Progression**: Create card → Add description → Generate/write caption → Select target platform → Add planning notes → Save
- **Success criteria**: All content details persist and can be edited/deleted

### Content Library
- **Functionality**: List view of all content ideas with filtering and search
- **Purpose**: Allows creators to review, search, and manage all their content ideas
- **Trigger**: User navigates to library view
- **Progression**: View list → Filter by platform/status → Search by keyword → Select card to edit → Update or delete
- **Success criteria**: Displays all content with responsive filtering and search

## Edge Case Handling

- **Empty States**: Show helpful onboarding messages when no content exists yet, encouraging users to create their first idea
- **API Failures**: Display friendly error message if AI generation fails, allow manual caption entry
- **Long Content**: Truncate long captions in list views with expand option, show character counts
- **Date Management**: Allow users to add content without dates (drafts), easily reschedule by drag-drop or date picker

## Design Direction

The design should feel like a creative studio workspace - vibrant, energetic, and inspiring. It should spark creativity with bold colors and dynamic layouts while maintaining organization through clear structure and hierarchy. The interface should feel modern and professional but not corporate.

## Color Selection

A bold, creative palette that energizes users while maintaining professional polish.

- **Primary Color**: Deep Purple `oklch(0.45 0.18 285)` - Represents creativity and innovation, used for primary actions and headers
- **Secondary Colors**: 
  - Bright Cyan `oklch(0.75 0.15 195)` - Fresh and modern, used for interactive elements and accents
  - Warm Coral `oklch(0.70 0.15 25)` - Energetic and friendly, used for AI generation features
- **Accent Color**: Electric Magenta `oklch(0.65 0.25 330)` - Bold attention grabber for CTAs and important highlights
- **Foreground/Background Pairings**: 
  - Primary (Deep Purple): White text `oklch(1 0 0)` - Ratio 8.2:1 ✓
  - Bright Cyan: Deep Navy `oklch(0.20 0.05 250)` - Ratio 12.1:1 ✓
  - Warm Coral: White text `oklch(1 0 0)` - Ratio 4.9:1 ✓
  - Accent (Electric Magenta): White text `oklch(1 0 0)` - Ratio 5.1:1 ✓

## Font Selection

Typography should feel modern and creative while maintaining excellent readability for content planning.

- **Typographic Hierarchy**: 
  - H1 (Page Titles): Space Grotesk Bold/32px/tight letter spacing (-0.02em)
  - H2 (Section Headers): Space Grotesk Semibold/24px/normal spacing
  - H3 (Card Titles): Space Grotesk Medium/18px/normal spacing
  - Body (Content/Captions): Inter Regular/15px/relaxed line height (1.6)
  - Small (Metadata): Inter Regular/13px/normal line height

## Animations

Animations should feel snappy and playful, reinforcing the creative nature of content planning. Use spring-based physics for natural motion when cards appear or are interacted with. Subtle hover states on interactive elements. Smooth transitions between calendar and list views. Gentle fade-ins for AI-generated content to create a sense of "magic appearing."

## Component Selection

- **Components**: 
  - `Calendar` for date-based content planning view
  - `Card` for content idea containers with hover states
  - `Dialog` for detailed content editing modal
  - `Button` with size/variant modifications for CTAs (primary actions use filled style with primary color)
  - `Textarea` for caption and description input
  - `Select` for platform and tone selection
  - `Badge` for platform tags and status indicators
  - `Tabs` for switching between calendar/list views
  - `Input` for search and filtering
  - `Separator` for visual section breaks
- **Customizations**: 
  - Custom content card component with gradient borders and hover lift effect
  - Custom calendar day cells with content preview thumbnails
  - AI generation button with animated gradient background
- **States**: 
  - Buttons: subtle scale on hover (1.02), pressed state (0.98), disabled with reduced opacity
  - Cards: lift on hover with shadow increase, selected state with accent border
  - Inputs: focus state with cyan ring, error state with coral border
- **Icon Selection**: 
  - `CalendarBlank` for calendar view
  - `List` for library view
  - `Sparkle` for AI generation
  - `Plus` for adding content
  - `MagicWand` for inspiration features
  - `Copy` for copying captions
  - `PencilSimple` for editing
  - `Trash` for deletion
- **Spacing**: 
  - Container padding: `p-6` (24px)
  - Card padding: `p-4` (16px)
  - Section gaps: `gap-6` (24px)
  - Element gaps: `gap-3` (12px)
  - Tight spacing: `gap-2` (8px)
- **Mobile**: 
  - Stack calendar days vertically on mobile
  - Full-width cards with reduced padding
  - Bottom sheet for content editing instead of centered dialog
  - Simplified navigation with tab bar at bottom
  - Hide secondary actions in overflow menu
