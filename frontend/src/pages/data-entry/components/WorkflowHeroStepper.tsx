import { Link } from 'react-router-dom'
import '../workflow-shell.css'

export type WorkflowHeroStepperProps = {
  phase: 'data-entry' | 'recipes'
  iconClass: string
  title: string
  tagline: string
  dataEntryPath: string
  recipesPath: string
  labelDataEntry: string
  labelRecipes: string
  /** Prefer navigate with discard modal (dirty forms); fallback Link if omitted */
  onNavigateToRecipes?: () => void
}

export function WorkflowHeroStepper({
  phase,
  iconClass,
  title,
  tagline,
  dataEntryPath,
  recipesPath,
  labelDataEntry,
  labelRecipes,
  onNavigateToRecipes,
}: WorkflowHeroStepperProps) {
  return (
    <header className="recipes-hero workflow-shell-root">
      <div className="recipes-hero__brand">
        <span className="recipes-hero__icon-wrap" aria-hidden>
          <i className={iconClass} />
        </span>
        <div className="recipes-hero__text">
          <h1 className="recipes-hero__title">{title}</h1>
          <p className="recipes-hero__tagline">{tagline}</p>
        </div>
      </div>

      <nav className="recipes-stepper" aria-label="Workflow steps">
        {phase === 'data-entry' ? (
          <>
            <div className="recipes-stepper__segment">
              <span className="recipes-stepper__step recipes-stepper__step--active-entry">
                <span className="recipes-stepper__badge" aria-hidden>
                  1
                </span>
                <span className="recipes-stepper__label">{labelDataEntry}</span>
              </span>
            </div>
            <span className="recipes-stepper__rail" aria-hidden />
            <div className="recipes-stepper__segment">
              {onNavigateToRecipes ? (
                <button
                  type="button"
                  className="recipes-stepper__step recipes-stepper__step--pending"
                  onClick={onNavigateToRecipes}
                  aria-label={labelRecipes}
                >
                  <span className="recipes-stepper__badge recipes-stepper__badge--pending" aria-hidden>
                    2
                  </span>
                  <span className="recipes-stepper__label">{labelRecipes}</span>
                </button>
              ) : (
                <Link to={recipesPath} className="recipes-stepper__step recipes-stepper__step--pending" style={{ textDecoration: 'none' }}>
                  <span className="recipes-stepper__badge recipes-stepper__badge--pending" aria-hidden>
                    2
                  </span>
                  <span className="recipes-stepper__label">{labelRecipes}</span>
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="recipes-stepper__segment">
              <Link to={dataEntryPath} className="recipes-stepper__step recipes-stepper__step--complete" style={{ textDecoration: 'none' }}>
                <span className="recipes-stepper__badge" aria-hidden>
                  1
                </span>
                <span className="recipes-stepper__label">{labelDataEntry}</span>
              </Link>
            </div>
            <span className="recipes-stepper__rail" aria-hidden />
            <div className="recipes-stepper__segment">
              <span className="recipes-stepper__step recipes-stepper__step--current">
                <span className="recipes-stepper__badge" aria-hidden>
                  2
                </span>
                <span className="recipes-stepper__label">{labelRecipes}</span>
              </span>
            </div>
          </>
        )}
      </nav>
    </header>
  )
}
