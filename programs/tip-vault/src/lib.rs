use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("Bqe678ZN7zXYWWnZqVNKGVbGe5javsqdhoLcyYb8JUsY");

#[program]
pub mod tip_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        rate_per_slot: u64,
        initial_deposit: u64,
    ) -> Result<()> {
        require!(rate_per_slot > 0, TipError::InvalidRate);

        let vault = &mut ctx.accounts.vault;
        vault.tipper = ctx.accounts.tipper.key();
        vault.recipient = ctx.accounts.recipient.key();
        vault.rate_per_slot = rate_per_slot;
        vault.last_claim_slot = Clock::get()?.slot;
        vault.total_claimed = 0;
        vault.bump = ctx.bumps.vault;

        if initial_deposit > 0 {
            transfer_sol(
                &ctx.accounts.tipper,
                &vault.to_account_info(),
                &ctx.accounts.system_program,
                initial_deposit,
            )?;
        }
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let current_slot = Clock::get()?.slot;

        let elapsed = current_slot.saturating_sub(vault.last_claim_slot);
        let vested = elapsed.saturating_mul(vault.rate_per_slot);

        // Reserve rent-exempt minimum so the vault account stays alive.
        let rent_exempt = Rent::get()?.minimum_balance(8 + Vault::LEN);
        let vault_info = vault.to_account_info();
        let spendable = vault_info.lamports().saturating_sub(rent_exempt);

        let claimable = vested.min(spendable);
        require!(claimable > 0, TipError::NothingToClaim);

        // Advance last_claim_slot only by slots actually funded.
        // Prevents back-pay after a vault runs dry and is later topped up.
        let slots_consumed = claimable / vault.rate_per_slot;
        vault.last_claim_slot = vault.last_claim_slot.saturating_add(slots_consumed);
        vault.total_claimed = vault.total_claimed.saturating_add(claimable);

        **vault_info.try_borrow_mut_lamports()? -= claimable;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += claimable;

        Ok(())
    }

    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        require!(amount > 0, TipError::ZeroAmount);

        // If vault was empty, reset the vesting clock so the recipient
        // doesn't get a back-payment for unfunded time.
        let rent_exempt = Rent::get()?.minimum_balance(8 + Vault::LEN);
        let vault_info = ctx.accounts.vault.to_account_info();
        if vault_info.lamports() <= rent_exempt {
            ctx.accounts.vault.last_claim_slot = Clock::get()?.slot;
        }

        transfer_sol(
            &ctx.accounts.tipper,
            &vault_info,
            &ctx.accounts.system_program,
            amount,
        )?;
        Ok(())
    }

    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        // Settle any vested amount to recipient before returning unvested to tipper.
        let vault = &mut ctx.accounts.vault;
        let current_slot = Clock::get()?.slot;
        let elapsed = current_slot.saturating_sub(vault.last_claim_slot);
        let vested = elapsed.saturating_mul(vault.rate_per_slot);

        let rent_exempt = Rent::get()?.minimum_balance(8 + Vault::LEN);
        let vault_info = vault.to_account_info();
        let spendable = vault_info.lamports().saturating_sub(rent_exempt);
        let to_recipient = vested.min(spendable);

        if to_recipient > 0 {
            **vault_info.try_borrow_mut_lamports()? -= to_recipient;
            **ctx.accounts.recipient.try_borrow_mut_lamports()? += to_recipient;
        }
        // Anchor's `close = tipper` constraint returns the remaining lamports.
        Ok(())
    }

    // ─── SPL token variants ──────────────────────────────────────────────────
    // Same vesting semantics as the SOL path, but tokens are held in an ATA
    // owned by the TokenVault PDA. Rates and amounts are denominated in the
    // mint's base units (e.g. for USDC: 1_000_000 = 1 USDC).

    pub fn initialize_token_vault(
        ctx: Context<InitializeTokenVault>,
        rate_per_slot: u64,
        initial_deposit: u64,
    ) -> Result<()> {
        require!(rate_per_slot > 0, TipError::InvalidRate);

        let vault = &mut ctx.accounts.token_vault;
        vault.tipper = ctx.accounts.tipper.key();
        vault.recipient = ctx.accounts.recipient.key();
        vault.mint = ctx.accounts.mint.key();
        vault.rate_per_slot = rate_per_slot;
        vault.last_claim_slot = Clock::get()?.slot;
        vault.total_claimed = 0;
        vault.bump = ctx.bumps.token_vault;

        if initial_deposit > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.tipper_ata.to_account_info(),
                        to: ctx.accounts.vault_ata.to_account_info(),
                        authority: ctx.accounts.tipper.to_account_info(),
                    },
                ),
                initial_deposit,
            )?;
        }
        Ok(())
    }

    pub fn claim_token(ctx: Context<ClaimToken>) -> Result<()> {
        let vault = &mut ctx.accounts.token_vault;
        let current_slot = Clock::get()?.slot;

        let elapsed = current_slot.saturating_sub(vault.last_claim_slot);
        let vested = elapsed.saturating_mul(vault.rate_per_slot);
        let spendable = ctx.accounts.vault_ata.amount;

        let claimable = vested.min(spendable);
        require!(claimable > 0, TipError::NothingToClaim);

        let slots_consumed = claimable / vault.rate_per_slot;
        vault.last_claim_slot = vault.last_claim_slot.saturating_add(slots_consumed);
        vault.total_claimed = vault.total_claimed.saturating_add(claimable);

        let tipper = vault.tipper;
        let recipient = vault.recipient;
        let mint = vault.mint;
        let bump = [vault.bump];
        let seeds: &[&[u8]] = &[
            b"token_vault",
            tipper.as_ref(),
            recipient.as_ref(),
            mint.as_ref(),
            &bump,
        ];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_ata.to_account_info(),
                    to: ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.token_vault.to_account_info(),
                },
                signer_seeds,
            ),
            claimable,
        )?;
        Ok(())
    }

    pub fn top_up_token(ctx: Context<TopUpToken>, amount: u64) -> Result<()> {
        require!(amount > 0, TipError::ZeroAmount);

        // If vault ATA was empty, restart the vesting clock so the recipient
        // doesn't get back-paid for the unfunded interval.
        if ctx.accounts.vault_ata.amount == 0 {
            ctx.accounts.token_vault.last_claim_slot = Clock::get()?.slot;
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.tipper_ata.to_account_info(),
                    to: ctx.accounts.vault_ata.to_account_info(),
                    authority: ctx.accounts.tipper.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn close_token_vault(ctx: Context<CloseTokenVault>) -> Result<()> {
        // Settle vested tokens to recipient, return the rest to tipper, close
        // the ATA, then Anchor's `close = tipper` closes the vault PDA.
        let vault = &mut ctx.accounts.token_vault;
        let current_slot = Clock::get()?.slot;
        let elapsed = current_slot.saturating_sub(vault.last_claim_slot);
        let vested = elapsed.saturating_mul(vault.rate_per_slot);

        let balance = ctx.accounts.vault_ata.amount;
        let to_recipient = vested.min(balance);
        let remainder = balance - to_recipient;

        let tipper = vault.tipper;
        let recipient = vault.recipient;
        let mint = vault.mint;
        let bump = [vault.bump];
        let seeds: &[&[u8]] = &[
            b"token_vault",
            tipper.as_ref(),
            recipient.as_ref(),
            mint.as_ref(),
            &bump,
        ];
        let signer_seeds = &[seeds];

        if to_recipient > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_ata.to_account_info(),
                        to: ctx.accounts.recipient_ata.to_account_info(),
                        authority: ctx.accounts.token_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                to_recipient,
            )?;
        }

        if remainder > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_ata.to_account_info(),
                        to: ctx.accounts.tipper_ata.to_account_info(),
                        authority: ctx.accounts.token_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                remainder,
            )?;
        }

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault_ata.to_account_info(),
                destination: ctx.accounts.tipper.to_account_info(),
                authority: ctx.accounts.token_vault.to_account_info(),
            },
            signer_seeds,
        ))?;

        Ok(())
    }
}

fn transfer_sol<'info>(
    from: &Signer<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            system_program.to_account_info(),
            system_program::Transfer {
                from: from.to_account_info(),
                to: to.clone(),
            },
        ),
        amount,
    )
}

#[account]
pub struct Vault {
    pub tipper: Pubkey,
    pub recipient: Pubkey,
    pub rate_per_slot: u64,
    pub last_claim_slot: u64,
    pub total_claimed: u64,
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1;
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: only used as a seed + lamport destination; no data read.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        init,
        payer = tipper,
        space = 8 + Vault::LEN,
        seeds = [b"vault", tipper.key().as_ref(), recipient.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    /// CHECK: seed source; enforced via has_one on the vault.
    pub tipper: UncheckedAccount<'info>,
    /// CHECK: seed source; enforced via has_one on the vault.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault", tipper.key().as_ref(), recipient.key().as_ref()],
        bump = vault.bump,
        has_one = tipper,
        has_one = recipient,
    )]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct TopUp<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: seed source; enforced via has_one on the vault.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault", tipper.key().as_ref(), recipient.key().as_ref()],
        bump = vault.bump,
        has_one = tipper,
        has_one = recipient,
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: enforced via has_one on the vault.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    #[account(
        mut,
        close = tipper,
        seeds = [b"vault", tipper.key().as_ref(), recipient.key().as_ref()],
        bump = vault.bump,
        has_one = tipper,
        has_one = recipient,
    )]
    pub vault: Account<'info, Vault>,
}

// ─── Token vault state ──────────────────────────────────────────────────────

#[account]
pub struct TokenVault {
    pub tipper: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub rate_per_slot: u64,
    pub last_claim_slot: u64,
    pub total_claimed: u64,
    pub bump: u8,
}

impl TokenVault {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[derive(Accounts)]
pub struct InitializeTokenVault<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: seed source + stored on the vault for later claim checks.
    pub recipient: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = tipper,
        space = 8 + TokenVault::LEN,
        seeds = [
            b"token_vault",
            tipper.key().as_ref(),
            recipient.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub token_vault: Account<'info, TokenVault>,
    #[account(
        init_if_needed,
        payer = tipper,
        associated_token::mint = mint,
        associated_token::authority = token_vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = tipper,
    )]
    pub tipper_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimToken<'info> {
    /// CHECK: seed source; enforced via has_one on the vault.
    pub tipper: UncheckedAccount<'info>,
    /// CHECK: seed source; enforced via has_one on the vault.
    pub recipient: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [
            b"token_vault",
            tipper.key().as_ref(),
            recipient.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = token_vault.bump,
        has_one = tipper,
        has_one = recipient,
        has_one = mint,
    )]
    pub token_vault: Account<'info, TokenVault>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = token_vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TopUpToken<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: seed source; enforced via has_one.
    pub recipient: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [
            b"token_vault",
            tipper.key().as_ref(),
            recipient.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = token_vault.bump,
        has_one = tipper,
        has_one = recipient,
        has_one = mint,
    )]
    pub token_vault: Account<'info, TokenVault>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = token_vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = tipper,
    )]
    pub tipper_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseTokenVault<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: seed source; enforced via has_one.
    pub recipient: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        close = tipper,
        seeds = [
            b"token_vault",
            tipper.key().as_ref(),
            recipient.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = token_vault.bump,
        has_one = tipper,
        has_one = recipient,
        has_one = mint,
    )]
    pub token_vault: Account<'info, TokenVault>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = token_vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = tipper,
    )]
    pub tipper_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum TipError {
    #[msg("Nothing to claim yet")]
    NothingToClaim,
    #[msg("Rate per slot must be greater than zero")]
    InvalidRate,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
